import { sql } from "drizzle-orm";

import { fimDoMes, inicioDoMes, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import {
  calcularSubtotais,
  contribuicaoNaLinha,
  ESTRUTURA_DRE,
  linhaDoLancamento,
  margemPercentual,
  variacaoPercentual,
  type GrupoDre,
  type LinhaDre,
} from "../dominio/estrutura-dre";
import { mesesDoPeriodo, type MesDoResultado } from "../dominio/periodo-do-resultado";
import type {
  CategoriaNoResultado,
  FiltroResultado,
  LancamentoDoResultado,
  LinhaDoResultado,
  RepositorioDre,
  Resultado,
} from "../aplicacao/repositorio-dre";

/**
 * Quanto de uma baixa e JUROS de divida.
 *
 * Uma parcela de emprestimo mistura duas coisas de naturezas diferentes:
 * amortizacao (o dinheiro sai, a divida cai — nao empobrece a empresa) e juros
 * (custo de verdade). Somar a parcela inteira como despesa mostraria um
 * prejuizo que nao existe.
 *
 * Numa baixa PARCIAL o rateio e proporcional a composicao da parcela: pagar
 * metade de uma parcela de 1.000 (800 de amortizacao e 200 de juros) paga
 * metade de cada uma das partes. Juros-primeiro tambem seria defensavel, mas o
 * proporcional mantem o saldo devedor e o resultado sempre coerentes entre si.
 *
 * Fora de divida, a expressao vale zero e nada muda.
 */
const JUROS_DA_DIVIDA = sql`CASE
  WHEN pd.id IS NULL OR pd.valor_total = 0 THEN 0
  ELSE round(p.valor_principal * pd.valor_juros / pd.valor_total, 2)
END`;

/**
 * Demonstrativo de resultados no PostgreSQL.
 *
 * ----------------------------------------------------------------------
 * OS DOIS REGIMES, E POR QUE ELES NAO SE MISTURAM
 *
 * CAIXA le as BAIXAS (pagamentos e recebimentos nao estornados) pela data em
 * que o dinheiro se moveu, mais os lancamentos avulsos criados na conciliacao.
 * COMPETENCIA le os TITULOS pela competencia deles, tenham sido pagos ou nao.
 *
 * O mesmo mes pode ter resultados bem diferentes nos dois, e isso e o ponto:
 * uma escola que fatura em janeiro e recebe em marco tem lucro em janeiro por
 * competencia e caixa vazio ate marco. Quem so olha um dos dois decide errado.
 *
 * ----------------------------------------------------------------------
 * A CONTA DOS TRES VALORES DA BAIXA (heranca do Gate 5.1)
 *
 * Numa baixa, `valor_principal` guarda o ABATIMENTO (dinheiro + desconto),
 * e `valor_pago` guarda o que realmente saiu do banco. O demonstrativo usa os
 * dois, em linhas diferentes:
 *
 *     despesa operacional  = valor_principal          (a obrigacao "cheia")
 *     despesa financeira   = juros + multa
 *     desconto obtido      = valor_desconto           (+, nao passou no banco)
 *
 * Somando: −principal − (juros+multa) + desconto = −valor_pago. Ou seja, o
 * resultado de caixa fecha EXATAMENTE com o extrato — e ha teste de invariante
 * provando isso contra o banco real.
 *
 * ----------------------------------------------------------------------
 * O QUE FICA DE FORA, E DUAS VEZES
 *
 * Transferencia, estorno e ajuste de saldo sao excluidos pela ORIGEM na
 * consulta, e tambem cairiam fora pelo GRUPO do plano (`transferencia`). A
 * redundancia e proposital: um ajuste classificado por engano noutra categoria
 * continuaria fora do resultado, que e onde ele tem de estar.
 *
 * A AMORTIZACAO de divida tambem fica de fora (Gate 8): o dinheiro sai, mas a
 * divida cai junto — a empresa nao ficou mais pobre. Por isso a invariante de
 * caixa passou a ser "movimentacoes menos amortizacao menos credito de
 * emprestimo", e nao mais so "movimentacoes".
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`.
 */
export class RepositorioDreDrizzle implements RepositorioDre {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async montar(escopo: EscopoEmpresa, filtro: FiltroResultado, _hoje: DataCivil): Promise<Resultado> {
    const meses = mesesDoPeriodo(filtro.de, filtro.ate);
    const filtroPorContaDisponivel = filtro.regime === "caixa";

    const celulas =
      filtro.regime === "caixa" ? await this.celulasDeCaixa(escopo, filtro) : await this.celulasDeCompetencia(escopo, filtro);

    return montarDemonstrativo(filtro, meses, celulas, filtroPorContaDisponivel);
  }

  // --------------------------------------------------------------- caixa

  /**
   * O filtro opcional por conta bancaria, com o valor LIGADO como parametro.
   *
   * O id vem da URL. Interpolar texto vindo de fora direto na consulta abriria
   * injecao de SQL — por isso cada variante e um fragmento proprio com o
   * `${}` do Drizzle, que vira parametro, e nunca `sql.raw`.
   */
  private contaDoPagamento(filtro: FiltroResultado) {
    return filtro.contaBancariaId ? sql`AND p.conta_bancaria_id = ${filtro.contaBancariaId}` : sql``;
  }

  private contaDoRecebimento(filtro: FiltroResultado) {
    return filtro.contaBancariaId ? sql`AND r.conta_bancaria_id = ${filtro.contaBancariaId}` : sql``;
  }

  private contaDaMovimentacao(contaBancariaId?: string) {
    return contaBancariaId ? sql`AND m.conta_bancaria_id = ${contaBancariaId}` : sql``;
  }

  private async celulasDeCaixa(escopo: EscopoEmpresa, filtro: FiltroResultado): Promise<Celula[]> {
    const [pagos, recebidos, avulsos] = await Promise.all([
      this.banco.execute<LinhaDeBaixa>(sql`
        SELECT to_char(p.data_pagamento, 'YYYY-MM') AS competencia,
               cp.grupo_dre::text AS grupo,
               cf.nome AS categoria,
               -- Parte operacional: ZERO quando a baixa e de parcela de divida.
               SUM(CASE WHEN pd.id IS NULL THEN p.valor_principal ELSE 0 END)::text AS principal,
               -- Juros proprios da baixa (atraso) MAIS os juros embutidos na
               -- parcela da divida, na proporcao do que foi pago.
               SUM(p.valor_juros + p.valor_multa + ${JUROS_DA_DIVIDA})::text AS financeiro,
               SUM(p.valor_desconto)::text AS desconto
        FROM pagamentos p
        JOIN parcelas_pagar pp ON pp.id = p.parcela_pagar_id
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        LEFT JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE p.empresa_id = ${escopo.empresaId}
          AND p.situacao = 'registrado'
          AND p.data_pagamento BETWEEN ${filtro.de}::date AND ${filtro.ate}::date
          ${this.contaDoPagamento(filtro)}
        GROUP BY 1, 2, 3
      `),
      this.banco.execute<LinhaDeBaixa>(sql`
        SELECT to_char(r.data_recebimento, 'YYYY-MM') AS competencia,
               cp.grupo_dre::text AS grupo,
               cf.nome AS categoria,
               SUM(r.valor_principal)::text AS principal,
               SUM(r.valor_juros + r.valor_multa)::text AS financeiro,
               SUM(r.valor_desconto)::text AS desconto
        FROM recebimentos r
        JOIN parcelas_receber pr ON pr.id = r.parcela_receber_id
        JOIN titulos_receber t ON t.id = pr.titulo_receber_id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE r.empresa_id = ${escopo.empresaId}
          AND r.situacao = 'registrado'
          AND r.data_recebimento BETWEEN ${filtro.de}::date AND ${filtro.ate}::date
          ${this.contaDoRecebimento(filtro)}
        GROUP BY 1, 2, 3
      `),
      this.lancamentosAvulsos(escopo, filtro.de, filtro.ate, filtro.contaBancariaId),
    ]);

    const celulas: Celula[] = [];
    for (const linha of pagos) celulas.push(...celulasDaBaixa(linha, "saida"));
    for (const linha of recebidos) celulas.push(...celulasDaBaixa(linha, "entrada"));
    celulas.push(...avulsos);
    return celulas;
  }

  /**
   * Lancamentos que nasceram do extrato na conciliacao (tarifa, rendimento).
   *
   * Nao tem titulo por tras: sao fato de caixa com categoria obrigatoria. Por
   * isso entram nos DOIS regimes — em competencia, pela data do proprio
   * lancamento, que e a unica que existe.
   */
  private async lancamentosAvulsos(
    escopo: EscopoEmpresa,
    de: DataCivil,
    ate: DataCivil,
    contaBancariaId?: string,
  ): Promise<Celula[]> {
    const linhas = await this.banco.execute<LinhaDeMovimentacao>(sql`
      SELECT to_char(m.data_movimentacao, 'YYYY-MM') AS competencia,
             cp.grupo_dre::text AS grupo,
             cf.nome AS categoria,
             m.tipo::text AS tipo,
             SUM(m.valor)::text AS valor
      FROM movimentacoes_bancarias m
      LEFT JOIN categorias_financeiras cf ON cf.id = m.categoria_id
      LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
      WHERE m.empresa_id = ${escopo.empresaId}
        AND m.data_movimentacao BETWEEN ${de}::date AND ${ate}::date
        AND m.origem = 'extrato'
        ${this.contaDaMovimentacao(contaBancariaId)}
      GROUP BY 1, 2, 3, 4
    `);

    const celulas: Celula[] = [];
    for (const linha of linhas) {
      const alvo = linhaDoLancamento(linha.grupo as GrupoDre | null, linha.tipo);
      if (!alvo) continue;
      celulas.push({
        competencia: linha.competencia,
        linha: alvo,
        categoriaNome: linha.categoria ?? "Sem categoria",
        valor: contribuicaoNaLinha(alvo, linha.tipo, Dinheiro.deTexto(linha.valor)),
      });
    }
    return celulas;
  }

  // ---------------------------------------------------------- competencia

  /**
   * Competencia usa `titulos_*.data_competencia`, o campo proprio do modelo,
   * que o Gate 5 preenche com o mes do primeiro vencimento.
   *
   * O periodo e expandido para MESES INTEIROS aqui: competencia e um mes, e
   * pedir "de 10/09 a 20/10" nao pode fazer setembro sumir do demonstrativo
   * so porque a competencia esta gravada no dia 1.
   */
  private async celulasDeCompetencia(escopo: EscopoEmpresa, filtro: FiltroResultado): Promise<Celula[]> {
    const de = inicioDoMes(filtro.de);
    const ate = fimDoMes(filtro.ate);

    const [aPagar, aReceber, financeirasPagas, financeirasRecebidas, avulsos, jurosDeDivida] = await Promise.all([
      this.banco.execute<LinhaDeTitulo>(sql`
        SELECT to_char(t.data_competencia, 'YYYY-MM') AS competencia,
               cp.grupo_dre::text AS grupo,
               cf.nome AS categoria,
               -- Parcela de divida nao entra como despesa: so os juros dela
               -- entram, e na linha financeira (ver a consulta de juros de divida).
               SUM(CASE WHEN pd.id IS NOT NULL THEN 0
                        WHEN pp.situacao IN ('aberta', 'liquidada') THEN pp.valor_original
                        ELSE pp.valor_pago END)::text AS valor
        FROM parcelas_pagar pp
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        LEFT JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE t.empresa_id = ${escopo.empresaId}
          AND t.situacao NOT IN ('rascunho', 'aguardando_aprovacao')
          AND t.data_competencia BETWEEN ${de}::date AND ${ate}::date
        GROUP BY 1, 2, 3
      `),
      this.banco.execute<LinhaDeTitulo>(sql`
        SELECT to_char(t.data_competencia, 'YYYY-MM') AS competencia,
               cp.grupo_dre::text AS grupo,
               cf.nome AS categoria,
               SUM(CASE WHEN pr.situacao IN ('aberta', 'liquidada') THEN pr.valor_original ELSE pr.valor_recebido END)::text AS valor
        FROM parcelas_receber pr
        JOIN titulos_receber t ON t.id = pr.titulo_receber_id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE t.empresa_id = ${escopo.empresaId}
          AND t.situacao NOT IN ('rascunho', 'aguardando_aprovacao')
          AND t.data_competencia BETWEEN ${de}::date AND ${ate}::date
        GROUP BY 1, 2, 3
      `),
      /*
       * Juros, multa e desconto entram pela data da BAIXA, mesmo no regime de
       * competencia: o juro nasce quando o atraso acontece, nao quando a conta
       * venceu. E o que o enunciado do gate pede ("quando baixados").
       */
      this.banco.execute<LinhaFinanceira>(sql`
        SELECT to_char(p.data_pagamento, 'YYYY-MM') AS competencia,
               SUM(p.valor_juros + p.valor_multa)::text AS financeiro,
               SUM(p.valor_desconto)::text AS desconto
        FROM pagamentos p
        WHERE p.empresa_id = ${escopo.empresaId}
          AND p.situacao = 'registrado'
          AND p.data_pagamento BETWEEN ${de}::date AND ${ate}::date
        GROUP BY 1
      `),
      this.banco.execute<LinhaFinanceira>(sql`
        SELECT to_char(r.data_recebimento, 'YYYY-MM') AS competencia,
               SUM(r.valor_juros + r.valor_multa)::text AS financeiro,
               SUM(r.valor_desconto)::text AS desconto
        FROM recebimentos r
        WHERE r.empresa_id = ${escopo.empresaId}
          AND r.situacao = 'registrado'
          AND r.data_recebimento BETWEEN ${de}::date AND ${ate}::date
        GROUP BY 1
      `),
      this.lancamentosAvulsos(escopo, de, ate),
      /*
       * Os juros das parcelas de divida, por competencia do titulo. Sem esta
       * consulta eles sumiriam do regime de competencia: a consulta de titulos
       * zera a parcela de divida inteira (amortizacao E juros), porque nao tem
       * como separar as duas coisas la.
       */
      this.banco.execute<LinhaFinanceira>(sql`
        SELECT to_char(t.data_competencia, 'YYYY-MM') AS competencia,
               SUM(pd.valor_juros)::text AS financeiro,
               '0'::text AS desconto
        FROM parcelas_divida pd
        JOIN parcelas_pagar pp ON pp.id = pd.parcela_pagar_id
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        WHERE pd.empresa_id = ${escopo.empresaId}
          AND pd.situacao <> 'cancelada'
          AND t.situacao NOT IN ('rascunho', 'aguardando_aprovacao')
          AND t.data_competencia BETWEEN ${de}::date AND ${ate}::date
        GROUP BY 1
      `),
    ]);

    const celulas: Celula[] = [];

    for (const linha of jurosDeDivida) {
      celulas.push({
        competencia: linha.competencia,
        linha: "despesas_financeiras",
        categoriaNome: "Juros de empréstimos",
        valor: Dinheiro.deTexto(linha.financeiro),
      });
    }

    for (const [linhas, tipo] of [
      [aPagar, "saida"],
      [aReceber, "entrada"],
    ] as const) {
      for (const linha of linhas) {
        const alvo = linhaDoLancamento(linha.grupo as GrupoDre | null, tipo);
        if (!alvo) continue;
        celulas.push({
          competencia: linha.competencia,
          linha: alvo,
          categoriaNome: linha.categoria ?? "Sem categoria",
          valor: contribuicaoNaLinha(alvo, tipo, Dinheiro.deTexto(linha.valor)),
        });
      }
    }

    for (const linha of financeirasPagas) {
      celulas.push(
        { competencia: linha.competencia, linha: "despesas_financeiras", categoriaNome: "Juros e multas pagos", valor: Dinheiro.deTexto(linha.financeiro) },
        { competencia: linha.competencia, linha: "descontos_obtidos", categoriaNome: "Descontos obtidos", valor: Dinheiro.deTexto(linha.desconto) },
      );
    }
    for (const linha of financeirasRecebidas) {
      celulas.push(
        { competencia: linha.competencia, linha: "receitas_financeiras", categoriaNome: "Juros e multas recebidos", valor: Dinheiro.deTexto(linha.financeiro) },
        { competencia: linha.competencia, linha: "descontos_concedidos", categoriaNome: "Descontos concedidos", valor: Dinheiro.deTexto(linha.desconto) },
      );
    }

    celulas.push(...avulsos);
    return celulas;
  }

  // ---------------------------------------------------------- detalhamento

  async lancamentosDaLinha(
    escopo: EscopoEmpresa,
    filtro: FiltroResultado,
    linha: LinhaDre,
    opcoes: { readonly competencia?: string; readonly categoriaNome?: string } = {},
  ): Promise<readonly LancamentoDoResultado[]> {
    const { de, ate } =
      filtro.regime === "competencia"
        ? { de: inicioDoMes(filtro.de), ate: fimDoMes(filtro.ate) }
        : { de: filtro.de, ate: filtro.ate };

    const dentroDoMes = (competencia: string) => !opcoes.competencia || competencia === opcoes.competencia;
    const daCategoria = (nome: string | null) => !opcoes.categoriaNome || (nome ?? "Sem categoria") === opcoes.categoriaNome;

    const lancamentos =
      filtro.regime === "caixa"
        ? await this.detalhesDeCaixa(escopo, filtro, de, ate)
        : await this.detalhesDeCompetencia(escopo, de, ate);

    return lancamentos
      .filter((item) => item.linha === linha && dentroDoMes(item.competencia) && daCategoria(item.categoriaNome))
      .map(({ linha: _linha, competencia: _competencia, ...resto }) => resto);
  }

  private async detalhesDeCaixa(
    escopo: EscopoEmpresa,
    filtro: FiltroResultado,
    de: DataCivil,
    ate: DataCivil,
  ): Promise<DetalheInterno[]> {
    const [pagos, recebidos, avulsos] = await Promise.all([
      this.banco.execute<DetalheDeBaixa>(sql`
        SELECT p.id::text AS id, p.data_pagamento::text AS data, t.codigo, t.descricao,
               pes.nome AS pessoa, cf.nome AS categoria, cp.grupo_dre::text AS grupo,
               -- As MESMAS duas regras do total (ver \`celulasDeCaixa\`): a parte
               -- operacional zera quando a baixa e de parcela de divida, e os
               -- juros embutidos na parcela entram no financeiro. Uma linha que
               -- soma 295 e um detalhamento que lista 55 e pior do que nao ter
               -- detalhamento: quem confere fica sem saber onde esta o erro.
               (CASE WHEN pd.id IS NULL THEN p.valor_principal ELSE 0 END)::text AS principal,
               (p.valor_juros + p.valor_multa + ${JUROS_DA_DIVIDA})::text AS financeiro,
               p.valor_desconto::text AS desconto, pp.id::text AS parcela_id
        FROM pagamentos p
        JOIN parcelas_pagar pp ON pp.id = p.parcela_pagar_id
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        JOIN fornecedores f ON f.id = t.fornecedor_id
        JOIN pessoas pes ON pes.id = f.pessoa_id
        LEFT JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE p.empresa_id = ${escopo.empresaId} AND p.situacao = 'registrado'
          AND p.data_pagamento BETWEEN ${de}::date AND ${ate}::date
          ${this.contaDoPagamento(filtro)}
        ORDER BY p.data_pagamento, p.criado_em
        LIMIT 500
      `),
      this.banco.execute<DetalheDeBaixa>(sql`
        SELECT r.id::text AS id, r.data_recebimento::text AS data, t.codigo, t.descricao,
               pes.nome AS pessoa, cf.nome AS categoria, cp.grupo_dre::text AS grupo,
               r.valor_principal::text AS principal, (r.valor_juros + r.valor_multa)::text AS financeiro,
               r.valor_desconto::text AS desconto, pr.id::text AS parcela_id
        FROM recebimentos r
        JOIN parcelas_receber pr ON pr.id = r.parcela_receber_id
        JOIN titulos_receber t ON t.id = pr.titulo_receber_id
        JOIN clientes c ON c.id = t.cliente_id
        JOIN pessoas pes ON pes.id = c.pessoa_id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE r.empresa_id = ${escopo.empresaId} AND r.situacao = 'registrado'
          AND r.data_recebimento BETWEEN ${de}::date AND ${ate}::date
          ${this.contaDoRecebimento(filtro)}
        ORDER BY r.data_recebimento, r.criado_em
        LIMIT 500
      `),
      this.detalhesAvulsos(escopo, de, ate, filtro.contaBancariaId),
    ]);

    return [
      ...pagos.flatMap((linha) => detalhesDaBaixa(linha, "saida", "pagar")),
      ...recebidos.flatMap((linha) => detalhesDaBaixa(linha, "entrada", "receber")),
      ...avulsos,
    ];
  }

  private async detalhesDeCompetencia(escopo: EscopoEmpresa, de: DataCivil, ate: DataCivil): Promise<DetalheInterno[]> {
    const [aPagar, aReceber, pagos, recebidos, avulsos] = await Promise.all([
      this.banco.execute<DetalheDeTitulo>(sql`
        SELECT pp.id::text AS id, t.data_competencia::text AS data, t.codigo, t.descricao,
               pes.nome AS pessoa, cf.nome AS categoria, cp.grupo_dre::text AS grupo,
               (CASE WHEN pp.situacao IN ('aberta', 'liquidada') THEN pp.valor_original ELSE pp.valor_pago END)::text AS valor,
               pp.situacao::text AS situacao
        FROM parcelas_pagar pp
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        JOIN fornecedores f ON f.id = t.fornecedor_id
        JOIN pessoas pes ON pes.id = f.pessoa_id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE t.empresa_id = ${escopo.empresaId} AND t.situacao NOT IN ('rascunho', 'aguardando_aprovacao')
          AND t.data_competencia BETWEEN ${de}::date AND ${ate}::date
        ORDER BY t.data_competencia, t.codigo
        LIMIT 500
      `),
      this.banco.execute<DetalheDeTitulo>(sql`
        SELECT pr.id::text AS id, t.data_competencia::text AS data, t.codigo, t.descricao,
               pes.nome AS pessoa, cf.nome AS categoria, cp.grupo_dre::text AS grupo,
               (CASE WHEN pr.situacao IN ('aberta', 'liquidada') THEN pr.valor_original ELSE pr.valor_recebido END)::text AS valor,
               pr.situacao::text AS situacao
        FROM parcelas_receber pr
        JOIN titulos_receber t ON t.id = pr.titulo_receber_id
        JOIN clientes c ON c.id = t.cliente_id
        JOIN pessoas pes ON pes.id = c.pessoa_id
        LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE t.empresa_id = ${escopo.empresaId} AND t.situacao NOT IN ('rascunho', 'aguardando_aprovacao')
          AND t.data_competencia BETWEEN ${de}::date AND ${ate}::date
        ORDER BY t.data_competencia, t.codigo
        LIMIT 500
      `),
      this.banco.execute<DetalheFinanceiro>(sql`
        SELECT p.id::text AS id, p.data_pagamento::text AS data, t.codigo, t.descricao, pes.nome AS pessoa,
               (p.valor_juros + p.valor_multa)::text AS financeiro, p.valor_desconto::text AS desconto,
               pp.id::text AS parcela_id
        FROM pagamentos p
        JOIN parcelas_pagar pp ON pp.id = p.parcela_pagar_id
        JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
        JOIN fornecedores f ON f.id = t.fornecedor_id
        JOIN pessoas pes ON pes.id = f.pessoa_id
        WHERE p.empresa_id = ${escopo.empresaId} AND p.situacao = 'registrado'
          AND p.data_pagamento BETWEEN ${de}::date AND ${ate}::date
        LIMIT 500
      `),
      this.banco.execute<DetalheFinanceiro>(sql`
        SELECT r.id::text AS id, r.data_recebimento::text AS data, t.codigo, t.descricao, pes.nome AS pessoa,
               (r.valor_juros + r.valor_multa)::text AS financeiro, r.valor_desconto::text AS desconto,
               pr.id::text AS parcela_id
        FROM recebimentos r
        JOIN parcelas_receber pr ON pr.id = r.parcela_receber_id
        JOIN titulos_receber t ON t.id = pr.titulo_receber_id
        JOIN clientes c ON c.id = t.cliente_id
        JOIN pessoas pes ON pes.id = c.pessoa_id
        WHERE r.empresa_id = ${escopo.empresaId} AND r.situacao = 'registrado'
          AND r.data_recebimento BETWEEN ${de}::date AND ${ate}::date
        LIMIT 500
      `),
      this.detalhesAvulsos(escopo, de, ate),
    ]);

    const detalhes: DetalheInterno[] = [];

    for (const [linhas, tipo, area] of [
      [aPagar, "saida", "pagar"],
      [aReceber, "entrada", "receber"],
    ] as const) {
      for (const linha of linhas) {
        const alvo = linhaDoLancamento(linha.grupo as GrupoDre | null, tipo);
        if (!alvo) continue;
        const valor = Dinheiro.deTexto(linha.valor);
        if (valor.ehZero()) continue;
        detalhes.push({
          linha: alvo,
          competencia: linha.data.slice(0, 7),
          id: linha.id,
          data: linha.data as DataCivil,
          descricao: `${linha.codigo} · ${linha.descricao}`,
          pessoaNome: linha.pessoa,
          categoriaNome: linha.categoria,
          tipo,
          valor: contribuicaoNaLinha(alvo, tipo, valor),
          origem: linha.situacao === "cancelada" ? "cancelada (parte liquidada)" : "título",
          rota: `/contas-${area}/${linha.id}`,
        });
      }
    }

    for (const [linhas, area, linhaFinanceira, linhaDesconto] of [
      [pagos, "pagar", "despesas_financeiras", "descontos_obtidos"],
      [recebidos, "receber", "receitas_financeiras", "descontos_concedidos"],
    ] as const) {
      for (const linha of linhas) {
        detalhes.push(
          ...detalhesFinanceiros(linha, area, linhaFinanceira, linhaDesconto),
        );
      }
    }

    return [...detalhes, ...avulsos];
  }

  private async detalhesAvulsos(
    escopo: EscopoEmpresa,
    de: DataCivil,
    ate: DataCivil,
    contaBancariaId?: string,
  ): Promise<DetalheInterno[]> {
    const linhas = await this.banco.execute<{
      id: string; data: string; descricao: string; categoria: string | null; grupo: string | null;
      tipo: "entrada" | "saida"; valor: string; conta: string;
    }>(sql`
      SELECT m.id::text AS id, m.data_movimentacao::text AS data, m.descricao,
             cf.nome AS categoria, cp.grupo_dre::text AS grupo, m.tipo::text AS tipo,
             m.valor::text AS valor, m.conta_bancaria_id::text AS conta
      FROM movimentacoes_bancarias m
      LEFT JOIN categorias_financeiras cf ON cf.id = m.categoria_id
      LEFT JOIN contas_plano cp ON cp.id = cf.conta_plano_id
      WHERE m.empresa_id = ${escopo.empresaId}
        AND m.data_movimentacao BETWEEN ${de}::date AND ${ate}::date
        AND m.origem = 'extrato'
        ${this.contaDaMovimentacao(contaBancariaId)}
      ORDER BY m.data_movimentacao, m.criado_em
      LIMIT 500
    `);

    const detalhes: DetalheInterno[] = [];
    for (const linha of linhas) {
      const alvo = linhaDoLancamento(linha.grupo as GrupoDre | null, linha.tipo);
      if (!alvo) continue;
      detalhes.push({
        linha: alvo,
        competencia: linha.data.slice(0, 7),
        id: linha.id,
        data: linha.data as DataCivil,
        descricao: linha.descricao,
        pessoaNome: null,
        categoriaNome: linha.categoria,
        tipo: linha.tipo,
        valor: contribuicaoNaLinha(alvo, linha.tipo, Dinheiro.deTexto(linha.valor)),
        origem: "do extrato",
        rota: `/bancos/${linha.conta}`,
      });
    }
    return detalhes;
  }
}

// ------------------------------------------------------------------ apoio

interface LinhaDeBaixa extends Record<string, unknown> {
  competencia: string;
  grupo: string | null;
  categoria: string | null;
  principal: string;
  financeiro: string;
  desconto: string;
}

interface LinhaDeMovimentacao extends Record<string, unknown> {
  competencia: string;
  grupo: string | null;
  categoria: string | null;
  tipo: "entrada" | "saida";
  valor: string;
}

interface LinhaDeTitulo extends Record<string, unknown> {
  competencia: string;
  grupo: string | null;
  categoria: string | null;
  valor: string;
}

interface LinhaFinanceira extends Record<string, unknown> {
  competencia: string;
  financeiro: string;
  desconto: string;
}

interface Celula {
  readonly competencia: string;
  readonly linha: LinhaDre;
  readonly categoriaNome: string;
  readonly valor: Dinheiro;
}

interface DetalheDeBaixa extends Record<string, unknown> {
  id: string; data: string; codigo: string; descricao: string; pessoa: string;
  categoria: string | null; grupo: string | null; principal: string; financeiro: string;
  desconto: string; parcela_id: string;
}

interface DetalheDeTitulo extends Record<string, unknown> {
  id: string; data: string; codigo: string; descricao: string; pessoa: string;
  categoria: string | null; grupo: string | null; valor: string; situacao: string;
}

interface DetalheFinanceiro extends Record<string, unknown> {
  id: string; data: string; codigo: string; descricao: string; pessoa: string;
  financeiro: string; desconto: string; parcela_id: string;
}

type DetalheInterno = LancamentoDoResultado & { readonly linha: LinhaDre; readonly competencia: string };

/** As tres celulas que uma baixa gera: a operacional, a financeira e o desconto. */
function celulasDaBaixa(linha: LinhaDeBaixa, tipo: "entrada" | "saida"): Celula[] {
  const celulas: Celula[] = [];
  const operacional = linhaDoLancamento(linha.grupo as GrupoDre | null, tipo);

  if (operacional) {
    celulas.push({
      competencia: linha.competencia,
      linha: operacional,
      categoriaNome: linha.categoria ?? "Sem categoria",
      valor: contribuicaoNaLinha(operacional, tipo, Dinheiro.deTexto(linha.principal)),
    });
  }

  const financeiro = Dinheiro.deTexto(linha.financeiro);
  if (!financeiro.ehZero()) {
    celulas.push({
      competencia: linha.competencia,
      linha: tipo === "saida" ? "despesas_financeiras" : "receitas_financeiras",
      categoriaNome: tipo === "saida" ? "Juros e multas pagos" : "Juros e multas recebidos",
      valor: financeiro,
    });
  }

  const desconto = Dinheiro.deTexto(linha.desconto);
  if (!desconto.ehZero()) {
    celulas.push({
      competencia: linha.competencia,
      linha: tipo === "saida" ? "descontos_obtidos" : "descontos_concedidos",
      categoriaNome: tipo === "saida" ? "Descontos obtidos" : "Descontos concedidos",
      valor: desconto,
    });
  }

  return celulas;
}

function detalhesDaBaixa(linha: DetalheDeBaixa, tipo: "entrada" | "saida", area: "pagar" | "receber"): DetalheInterno[] {
  const base = {
    competencia: linha.data.slice(0, 7),
    id: linha.id,
    data: linha.data as DataCivil,
    descricao: `${linha.codigo} · ${linha.descricao}`,
    pessoaNome: linha.pessoa,
    tipo,
    rota: `/contas-${area}/${linha.parcela_id}`,
  };

  const detalhes: DetalheInterno[] = [];
  const operacional = linhaDoLancamento(linha.grupo as GrupoDre | null, tipo);
  const principal = Dinheiro.deTexto(linha.principal);
  if (operacional && !principal.ehZero()) {
    detalhes.push({
      ...base,
      linha: operacional,
      categoriaNome: linha.categoria,
      valor: contribuicaoNaLinha(operacional, tipo, principal),
      origem: "baixa",
    });
  }

  const financeiro = Dinheiro.deTexto(linha.financeiro);
  if (!financeiro.ehZero()) {
    detalhes.push({
      ...base,
      id: `${linha.id}-financeiro`,
      linha: tipo === "saida" ? "despesas_financeiras" : "receitas_financeiras",
      categoriaNome: tipo === "saida" ? "Juros e multas pagos" : "Juros e multas recebidos",
      valor: financeiro,
      origem: "juros e multa",
    });
  }

  const desconto = Dinheiro.deTexto(linha.desconto);
  if (!desconto.ehZero()) {
    detalhes.push({
      ...base,
      id: `${linha.id}-desconto`,
      linha: tipo === "saida" ? "descontos_obtidos" : "descontos_concedidos",
      categoriaNome: tipo === "saida" ? "Descontos obtidos" : "Descontos concedidos",
      valor: desconto,
      origem: "desconto",
    });
  }

  return detalhes;
}

function detalhesFinanceiros(
  linha: DetalheFinanceiro,
  area: "pagar" | "receber",
  linhaFinanceira: LinhaDre,
  linhaDesconto: LinhaDre,
): DetalheInterno[] {
  const base = {
    competencia: linha.data.slice(0, 7),
    data: linha.data as DataCivil,
    descricao: `${linha.codigo} · ${linha.descricao}`,
    pessoaNome: linha.pessoa,
    tipo: (area === "pagar" ? "saida" : "entrada") as "entrada" | "saida",
    rota: `/contas-${area}/${linha.parcela_id}`,
  };

  const detalhes: DetalheInterno[] = [];
  const financeiro = Dinheiro.deTexto(linha.financeiro);
  if (!financeiro.ehZero()) {
    detalhes.push({
      ...base,
      id: `${linha.id}-financeiro`,
      linha: linhaFinanceira,
      categoriaNome: area === "pagar" ? "Juros e multas pagos" : "Juros e multas recebidos",
      valor: financeiro,
      origem: "juros e multa",
    });
  }
  const desconto = Dinheiro.deTexto(linha.desconto);
  if (!desconto.ehZero()) {
    detalhes.push({
      ...base,
      id: `${linha.id}-desconto`,
      linha: linhaDesconto,
      categoriaNome: area === "pagar" ? "Descontos obtidos" : "Descontos concedidos",
      valor: desconto,
      origem: "desconto",
    });
  }
  return detalhes;
}

/** Monta o demonstrativo a partir das celulas ja classificadas. Funcao pura. */
export function montarDemonstrativo(
  filtro: FiltroResultado,
  meses: readonly MesDoResultado[],
  celulas: readonly Celula[],
  filtroPorContaDisponivel: boolean,
): Resultado {
  const indiceDoMes = new Map(meses.map((mes, indice) => [mes.competencia, indice]));

  const porLinha = new Map<LinhaDre, Dinheiro[]>();
  const porCategoria = new Map<string, { linha: LinhaDre; categoriaNome: string; porMes: Dinheiro[] }>();

  const zeros = () => meses.map(() => Dinheiro.zero());

  for (const celula of celulas) {
    const indice = indiceDoMes.get(celula.competencia);
    if (indice === undefined || celula.valor.ehZero()) continue;

    const daLinha = porLinha.get(celula.linha) ?? zeros();
    daLinha[indice] = daLinha[indice]!.somar(celula.valor);
    porLinha.set(celula.linha, daLinha);

    const chave = `${celula.linha}|${celula.categoriaNome}`;
    const daCategoria = porCategoria.get(chave) ?? { linha: celula.linha, categoriaNome: celula.categoriaNome, porMes: zeros() };
    daCategoria.porMes[indice] = daCategoria.porMes[indice]!.somar(celula.valor);
    porCategoria.set(chave, daCategoria);
  }

  // Subtotais mes a mes, usando a mesma funcao pura do dominio.
  const totaisPorMes = meses.map((_, indice) => {
    const doMes = new Map<LinhaDre, Dinheiro>();
    for (const [linha, valores] of porLinha) doMes.set(linha, valores[indice]!);
    return calcularSubtotais(doMes);
  });

  const linhas: LinhaDoResultado[] = ESTRUTURA_DRE.map((definicao) => {
    const porMes = totaisPorMes.map((mes) => mes.get(definicao.linha) ?? Dinheiro.zero());
    const categorias: CategoriaNoResultado[] = definicao.ehSubtotal
      ? []
      : [...porCategoria.values()]
          .filter((categoria) => categoria.linha === definicao.linha)
          .map((categoria) => ({
            categoriaNome: categoria.categoriaNome,
            porMes: categoria.porMes,
            total: Dinheiro.somarTodos(categoria.porMes),
          }))
          .filter((categoria) => !categoria.total.ehZero())
          .sort((a, b) => b.total.absoluto().comparar(a.total.absoluto()) || a.categoriaNome.localeCompare(b.categoriaNome));

    return {
      ...definicao,
      porMes,
      total: Dinheiro.somarTodos(porMes),
      variacoes: porMes.map((valor, indice) => (indice === 0 ? null : variacaoPercentual(valor, porMes[indice - 1]!))),
      categorias,
    };
  });

  const ler = (linha: LinhaDre) => linhas.find((l) => l.linha === linha)?.total ?? Dinheiro.zero();
  const receitaLiquida = ler("receita_liquida");
  const resultado = ler("resultado_periodo");
  const despesaTotal = ler("custos").somar(ler("despesas_operacionais")).somar(ler("despesas_financeiras"));

  return {
    regime: filtro.regime,
    meses,
    linhas,
    indicadores: { receitaLiquida, despesaTotal, resultado, margem: margemPercentual(resultado, receitaLiquida) },
    temDados: celulas.some((celula) => !celula.valor.ehZero()),
    filtroPorContaDisponivel,
  };
}
