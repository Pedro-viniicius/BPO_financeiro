import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { compararDatas, partesDaData, type DataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { situacaoDerivada, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/* Tabelas de outros modulos vem do agregador: esquema nao e interface publica. */
import {
  categoriasFinanceiras,
  contasBancarias,
  contasPlano,
  movimentacoesBancarias,
  parcelasPagar,
  pessoas,
  titulosPagar,
} from "@/banco-dados/esquemas/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados, type TransacaoBancoDados } from "@/nucleo/banco-dados/publico";
import { formatarCodigo, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";

import type { ParcelaDoCronograma, SistemaAmortizacao } from "@/compartilhado/financeiro/indice";
import { dividas, parcelasDivida } from "./esquema";
import type {
  DadosNovaDivida,
  DividaDetalhada,
  DividaNaLista,
  PainelDeDividas,
  ParcelaDaDivida,
  ParcelaNoHorizonte,
  RepositorioDividas,
} from "../aplicacao/repositorio-dividas";

/**
 * Dividas no PostgreSQL.
 *
 * ----------------------------------------------------------------------
 * UM SO FLUXO DE PAGAMENTO
 *
 * O modelo do Gate 3 previu `pagamentos_divida`, ou seja, um fluxo proprio.
 * O Gate 8 decidiu o contrario: cada parcela de divida VIRA uma parcela de
 * conta a pagar (ligadas por `parcelas_divida.parcela_pagar_id`), e quem paga
 * e o modulo de contas a pagar. Baixa, baixa parcial, estorno, desconto e
 * conciliacao ja existem la, ja foram verificados, e duplica-los significaria
 * manter duas vezes cada uma dessas regras — com a garantia de que um dia elas
 * divergiriam.
 *
 * `pagamentos_divida` fica sem uso. Nao foi removida: apagar tabela e
 * migracao destrutiva, e ela pode servir se um dia houver pagamento de divida
 * fora do fluxo normal.
 *
 * ----------------------------------------------------------------------
 * A CATEGORIA DO TITULO
 *
 * O titulo de contas a pagar de uma divida recebe uma categoria no grupo
 * `transferencia` ("Amortizacao de dividas"), criada sob demanda — o mesmo
 * padrao do "Ajuste de saldo" do Gate 5.1. Assim, se por algum motivo o
 * desdobramento do demonstrativo falhar, a parcela cai FORA do resultado em
 * vez de virar despesa inteira. Errar para o lado que nao inventa prejuizo.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`.
 */
const CONTA_PLANO_AMORTIZACAO = { codigo: "9.9.02", nome: "Amortização de dívidas" } as const;
const CATEGORIA_AMORTIZACAO = "Amortização de dívidas";

export class RepositorioDividasDrizzle implements RepositorioDividas {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async criar(
    escopo: EscopoEmpresa,
    dados: DadosNovaDivida,
    cronograma: readonly ParcelaDoCronograma[],
  ): Promise<{ dividaId: string; tituloPagarId: string }> {
    return executarEmTransacao(async (transacao) => {
      if (cronograma.length === 0) throw new Error("CRONOGRAMA_VAZIO");

      // Credor e categoria precisam ser DESTA empresa/organizacao: saber o
      // UUID nao basta.
      const [credor] = await transacao
        .select({ id: pessoas.id, nome: pessoas.nome })
        .from(pessoas)
        .where(and(eq(pessoas.id, dados.credorPessoaId), eq(pessoas.organizacaoId, escopo.organizacaoId)))
        .limit(1);
      if (!credor) throw new Error("CREDOR_NAO_ENCONTRADO");

      const [categoriaJuros] = await transacao
        .select({ id: categoriasFinanceiras.id })
        .from(categoriasFinanceiras)
        .where(and(eq(categoriasFinanceiras.id, dados.categoriaJurosId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)))
        .limit(1);
      if (!categoriaJuros) throw new Error("CATEGORIA_NAO_ENCONTRADA");

      if (dados.contaBancariaCreditoId) {
        const [conta] = await transacao
          .select({ id: contasBancarias.id })
          .from(contasBancarias)
          .where(and(eq(contasBancarias.id, dados.contaBancariaCreditoId), eq(contasBancarias.empresaId, escopo.empresaId)))
          .limit(1);
        if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");
      }

      const codigo = await this.proximoCodigo(transacao, escopo, dados.dataContratacao);

      const [divida] = await transacao
        .insert(dividas)
        .values({
          empresaId: escopo.empresaId,
          codigo,
          credorPessoaId: dados.credorPessoaId,
          tipo: dados.tipo,
          descricao: dados.descricao,
          numeroContrato: dados.numeroContrato ?? null,
          dataContratacao: dados.dataContratacao,
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          taxaJurosMensal: String(dados.taxaMensal),
          sistemaAmortizacao: dados.sistema,
          quantidadeParcelas: cronograma.length,
          categoriaJurosId: dados.categoriaJurosId,
          contaBancariaCreditoId: dados.contaBancariaCreditoId ?? null,
          observacoes: dados.observacoes ?? null,
          situacao: "ativa",
        })
        .returning({ id: dividas.id });

      /*
       * O fornecedor de contas a pagar e o credor. `fornecedores` e um PAPEL
       * da pessoa na empresa (decisao do Gate 3): se o credor ainda nao tem
       * esse papel, ele e criado aqui — cobrar do usuario um cadastro extra
       * para registrar um emprestimo so atrapalharia.
       */
      const fornecedorId = await this.garantirFornecedor(transacao, escopo, dados.credorPessoaId);
      const categoriaAmortizacao = await this.garantirCategoriaDeAmortizacao(transacao, escopo);
      const codigoConta = await this.proximoCodigoDeContaPagar(transacao, escopo, dados.dataContratacao);
      const total = Dinheiro.somarTodos(cronograma.map((parcela) => parcela.valorTotal));

      const [titulo] = await transacao
        .insert(titulosPagar)
        .values({
          empresaId: escopo.empresaId,
          codigo: codigoConta,
          fornecedorId,
          descricao: `${codigo} · ${dados.descricao}`,
          dataCompetencia: dados.dataContratacao,
          valorTotal: total.paraTexto(),
          quantidadeParcelas: cronograma.length,
          categoriaId: categoriaAmortizacao,
          situacao: "aberto",
          criadoPorUsuarioId: dados.usuarioId,
          observacoes: `Parcelas do contrato ${dados.numeroContrato ?? codigo}.`,
        })
        .returning({ id: titulosPagar.id });

      const parcelasDeContaPagar = await transacao
        .insert(parcelasPagar)
        .values(
          cronograma.map((parcela) => ({
            tituloPagarId: titulo!.id,
            empresaId: escopo.empresaId,
            numeroParcela: parcela.numero,
            dataVencimento: parcela.dataVencimento,
            // A parcela de conta a pagar vale o TOTAL (amortizacao + juros):
            // e esse o compromisso, e e o que tem de aparecer na lista e na
            // previsao de caixa.
            valorOriginal: parcela.valorTotal.paraTexto(),
            situacao: "aberta" as const,
          })),
        )
        .returning({ id: parcelasPagar.id, numero: parcelasPagar.numeroParcela });

      const porNumero = new Map(parcelasDeContaPagar.map((parcela) => [parcela.numero, parcela.id]));

      await transacao.insert(parcelasDivida).values(
        cronograma.map((parcela) => ({
          dividaId: divida!.id,
          empresaId: escopo.empresaId,
          numeroParcela: parcela.numero,
          dataVencimento: parcela.dataVencimento,
          valorAmortizacao: parcela.valorAmortizacao.paraTexto(),
          valorJuros: parcela.valorJuros.paraTexto(),
          valorTotal: parcela.valorTotal.paraTexto(),
          parcelaPagarId: porNumero.get(parcela.numero) ?? null,
          situacao: "aberta" as const,
        })),
      );

      /*
       * O credito do emprestimo: dinheiro que ENTRA e nao e receita. Usa a
       * mesma categoria de amortizacao (grupo `transferencia`), entao fica
       * fora do resultado por construcao, e aparece no extrato e no fluxo de
       * caixa, onde e caixa de verdade.
       */
      if (dados.contaBancariaCreditoId) {
        await transacao.insert(movimentacoesBancarias).values({
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaCreditoId,
          dataMovimentacao: dados.dataContratacao,
          tipo: "entrada",
          valor: dados.valorPrincipal.paraTexto(),
          descricao: `Crédito do empréstimo ${codigo} · ${credor.nome}`,
          origem: "ajuste_manual",
          categoriaId: categoriaAmortizacao,
          observacoes: "Entrada do valor contratado. Não é receita.",
        });
      }

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "divida.criada",
        entidade: "divida",
        entidadeId: divida!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          codigo,
          credor: credor.nome,
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          taxaMensal: dados.taxaMensal,
          sistema: dados.sistema,
          parcelas: cronograma.length,
          totalComJuros: total.paraTexto(),
          creditoRegistrado: Boolean(dados.contaBancariaCreditoId),
        },
      });

      return { dividaId: divida!.id, tituloPagarId: titulo!.id };
    }, this.banco);
  }

  async listar(escopo: EscopoEmpresa, hoje: DataCivil): Promise<readonly DividaNaLista[]> {
    const linhas = await this.linhasDeParcela(escopo);
    const porDivida = new Map<string, LinhaDeParcela[]>();
    for (const linha of linhas) porDivida.set(linha.divida_id, [...(porDivida.get(linha.divida_id) ?? []), linha]);

    const cabecalhos = await this.banco
      .select({
        id: dividas.id,
        codigo: dividas.codigo,
        credorNome: pessoas.nome,
        tipo: dividas.tipo,
        descricao: dividas.descricao,
        valorPrincipal: dividas.valorPrincipal,
        taxaMensal: dividas.taxaJurosMensal,
        sistema: dividas.sistemaAmortizacao,
        quantidadeParcelas: dividas.quantidadeParcelas,
        situacao: dividas.situacao,
      })
      .from(dividas)
      .innerJoin(pessoas, eq(pessoas.id, dividas.credorPessoaId))
      .where(eq(dividas.empresaId, escopo.empresaId))
      .orderBy(asc(dividas.codigo));

    return cabecalhos.map((cabecalho) => montarResumo(cabecalho, porDivida.get(cabecalho.id) ?? [], hoje));
  }

  async buscarPorId(escopo: EscopoEmpresa, dividaId: string, hoje: DataCivil): Promise<DividaDetalhada | null> {
    const [cabecalho] = await this.banco
      .select({
        id: dividas.id,
        codigo: dividas.codigo,
        credorNome: pessoas.nome,
        tipo: dividas.tipo,
        descricao: dividas.descricao,
        numeroContrato: dividas.numeroContrato,
        dataContratacao: dividas.dataContratacao,
        valorPrincipal: dividas.valorPrincipal,
        taxaMensal: dividas.taxaJurosMensal,
        sistema: dividas.sistemaAmortizacao,
        quantidadeParcelas: dividas.quantidadeParcelas,
        situacao: dividas.situacao,
        categoriaJurosNome: categoriasFinanceiras.nome,
        observacoes: dividas.observacoes,
      })
      .from(dividas)
      .innerJoin(pessoas, eq(pessoas.id, dividas.credorPessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, dividas.categoriaJurosId))
      .where(and(eq(dividas.id, dividaId), eq(dividas.empresaId, escopo.empresaId)))
      .limit(1);
    if (!cabecalho) return null;

    const linhas = (await this.linhasDeParcela(escopo, dividaId)).sort((a, b) => a.numero - b.numero);
    const resumo = montarResumo(cabecalho, linhas, hoje);

    const valorContratado = Dinheiro.deTexto(cabecalho.valorPrincipal);
    let saldo = valorContratado;
    const parcelas: ParcelaDaDivida[] = linhas.map((linha) => {
      const amortizacao = Dinheiro.deTexto(linha.valor_amortizacao);
      saldo = saldo.subtrair(amortizacao);
      return {
        id: linha.id,
        numeroParcela: linha.numero,
        dataVencimento: linha.data_vencimento as DataVencimento,
        valorAmortizacao: amortizacao,
        valorJuros: Dinheiro.deTexto(linha.valor_juros),
        valorTotal: Dinheiro.deTexto(linha.valor_total),
        saldoDevedor: saldo.ehNegativo() ? Dinheiro.zero() : saldo,
        parcelaPagarId: linha.parcela_pagar_id,
        situacao: situacaoDaParcela(linha, hoje),
        valorPago: Dinheiro.deTexto(linha.valor_pago ?? "0"),
      };
    });

    const [tituloLinha] = await this.banco.execute<{ id: string | null }>(sql`
      SELECT pp.titulo_pagar_id::text AS id
      FROM parcelas_divida pd JOIN parcelas_pagar pp ON pp.id = pd.parcela_pagar_id
      WHERE pd.divida_id = ${dividaId} AND pd.empresa_id = ${escopo.empresaId}
      LIMIT 1
    `);

    return {
      ...resumo,
      numeroContrato: cabecalho.numeroContrato,
      dataContratacao: cabecalho.dataContratacao as DataCivil,
      categoriaJurosNome: cabecalho.categoriaJurosNome,
      observacoes: cabecalho.observacoes,
      tituloPagarId: tituloLinha?.id ?? null,
      parcelas,
      totalDeJuros: Dinheiro.somarTodos(parcelas.map((parcela) => parcela.valorJuros)),
      jurosPagos: Dinheiro.somarTodos(linhas.map((linha) => jurosPagosDaLinha(linha))),
    };
  }

  async painel(escopo: EscopoEmpresa, hoje: DataCivil): Promise<PainelDeDividas> {
    const lista = await this.listar(escopo, hoje);
    const ativas = lista.filter((divida) => divida.situacao !== "cancelada" && divida.situacao !== "quitada");

    const { ano } = partesDaData(hoje);
    const daquiUmAno = `${ano + 1}-${hoje.slice(5)}`;

    const proximas = await this.banco.execute<{
      divida_id: string; codigo: string; credor: string; vencimento: string; total: string; parcela_pagar_id: string | null;
    }>(sql`
      SELECT pd.divida_id::text AS divida_id, d.codigo, pes.nome AS credor,
             pd.data_vencimento::text AS vencimento, pd.valor_total::text AS total,
             pd.parcela_pagar_id::text AS parcela_pagar_id
      FROM parcelas_divida pd
      JOIN dividas d ON d.id = pd.divida_id
      JOIN pessoas pes ON pes.id = d.credor_pessoa_id
      LEFT JOIN parcelas_pagar pp ON pp.id = pd.parcela_pagar_id
      WHERE pd.empresa_id = ${escopo.empresaId}
        AND pd.situacao = 'aberta'
        AND d.situacao = 'ativa'
        AND COALESCE(pp.situacao::text, 'aberta') = 'aberta'
        AND pd.data_vencimento BETWEEN ${hoje}::date AND ${daquiUmAno}::date
      ORDER BY pd.data_vencimento
      LIMIT 200
    `);

    const [juros] = await this.banco.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(round(p.valor_principal * pd.valor_juros / NULLIF(pd.valor_total, 0), 2)), 0)::text AS total
      FROM pagamentos p
      JOIN parcelas_pagar pp ON pp.id = p.parcela_pagar_id
      JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
      WHERE p.empresa_id = ${escopo.empresaId}
        AND p.situacao = 'registrado'
        AND extract(year from p.data_pagamento) = ${ano}
    `);

    const horizonte: ParcelaNoHorizonte[] = [...proximas].map((linha) => ({
      dividaId: linha.divida_id,
      codigo: linha.codigo,
      credorNome: linha.credor,
      dataVencimento: linha.vencimento as DataVencimento,
      valorTotal: Dinheiro.deTexto(linha.total),
      parcelaPagarId: linha.parcela_pagar_id,
    }));

    return {
      endividamentoTotal: Dinheiro.somarTodos(ativas.map((divida) => divida.saldoDevedor)),
      dividasAtivas: ativas.length,
      parcelasEmAtraso: lista.reduce((soma, divida) => soma + divida.parcelasEmAtraso, 0),
      proximosDozeMeses: horizonte,
      totalProximosDozeMeses: Dinheiro.somarTodos(horizonte.map((parcela) => parcela.valorTotal)),
      jurosPagosNoAno: Dinheiro.deTexto(juros?.total ?? "0"),
    };
  }

  /**
   * Cancela a divida e o que ainda nao foi pago.
   *
   * As parcelas ja pagas continuam pagas — o dinheiro saiu de verdade. O
   * cancelamento das parcelas em aberto acontece no TITULO de contas a pagar,
   * que e onde elas vivem, pela mesma regra do Gate 5.1.
   */
  async cancelar(escopo: EscopoEmpresa, dividaId: string, dados: { motivo: string; usuarioId: string }): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      if (!dados.motivo.trim()) throw new Error("MOTIVO_OBRIGATORIO");

      const [divida] = await transacao
        .select({ id: dividas.id, situacao: dividas.situacao })
        .from(dividas)
        .where(and(eq(dividas.id, dividaId), eq(dividas.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!divida) throw new Error("DIVIDA_NAO_ENCONTRADA");
      if (divida.situacao === "cancelada") throw new Error("DIVIDA_JA_CANCELADA");

      const abertas = await transacao.execute<{ parcela_divida: string; parcela_pagar: string | null }>(sql`
        SELECT pd.id::text AS parcela_divida, pd.parcela_pagar_id::text AS parcela_pagar
        FROM parcelas_divida pd
        LEFT JOIN parcelas_pagar pp ON pp.id = pd.parcela_pagar_id
        WHERE pd.divida_id = ${dividaId}
          AND pd.empresa_id = ${escopo.empresaId}
          AND pd.situacao = 'aberta'
          AND COALESCE(pp.situacao::text, 'aberta') = 'aberta'
        FOR UPDATE OF pd
      `);

      const idsDeConta = [...abertas].map((linha) => linha.parcela_pagar).filter((id): id is string => Boolean(id));
      if (idsDeConta.length > 0) {
        await transacao
          .update(parcelasPagar)
          .set({ situacao: "cancelada", atualizadoEm: new Date() })
          .where(and(inArray(parcelasPagar.id, idsDeConta), eq(parcelasPagar.empresaId, escopo.empresaId)));
      }

      /*
       * SO as parcelas cujo pagamento ainda nao aconteceu. Sem a condicao
       * sobre a conta a pagar, uma parcela ja LIQUIDADA tambem viraria
       * "cancelada" aqui — e o cronograma passaria a dizer que um pagamento
       * que saiu do banco nunca existiu.
       */
      await transacao.execute(sql`
        UPDATE parcelas_divida pd SET situacao = 'cancelada', atualizado_em = now()
        WHERE pd.divida_id = ${dividaId}
          AND pd.empresa_id = ${escopo.empresaId}
          AND pd.situacao = 'aberta'
          AND COALESCE(
                (SELECT pp.situacao::text FROM parcelas_pagar pp WHERE pp.id = pd.parcela_pagar_id),
                'aberta'
              ) <> 'liquidada'
      `);

      // O titulo de contas a pagar so e cancelado quando nao sobra parcela viva.
      await transacao.execute(sql`
        UPDATE titulos_pagar t
        SET situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = ${dados.motivo.trim()}, atualizado_em = now()
        WHERE t.empresa_id = ${escopo.empresaId}
          AND t.situacao <> 'cancelado'
          AND EXISTS (
            SELECT 1 FROM parcelas_pagar pp JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
            WHERE pp.titulo_pagar_id = t.id AND pd.divida_id = ${dividaId}
          )
          AND NOT EXISTS (
            SELECT 1 FROM parcelas_pagar pp WHERE pp.titulo_pagar_id = t.id AND pp.situacao = 'aberta'
          )
      `);

      await transacao
        .update(dividas)
        .set({ situacao: "cancelada", atualizadoEm: new Date() })
        .where(and(eq(dividas.id, dividaId), eq(dividas.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "divida.cancelada",
        entidade: "divida",
        entidadeId: dividaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: { motivo: dados.motivo.trim(), parcelasCanceladas: idsDeConta.length },
      });
    }, this.banco);
  }

  // ---------------------------------------------------------------- apoio

  private async linhasDeParcela(escopo: EscopoEmpresa, dividaId?: string): Promise<LinhaDeParcela[]> {
    const linhas = await this.banco.execute<LinhaDeParcela>(sql`
      SELECT pd.id::text AS id, pd.divida_id::text AS divida_id, pd.numero_parcela AS numero,
             pd.data_vencimento::text AS data_vencimento,
             pd.valor_amortizacao::text AS valor_amortizacao,
             pd.valor_juros::text AS valor_juros,
             pd.valor_total::text AS valor_total,
             pd.situacao::text AS situacao_divida,
             pd.parcela_pagar_id::text AS parcela_pagar_id,
             pp.situacao::text AS situacao_conta,
             pp.valor_original::text AS valor_original,
             pp.valor_pago::text AS valor_pago
      FROM parcelas_divida pd
      LEFT JOIN parcelas_pagar pp ON pp.id = pd.parcela_pagar_id
      WHERE pd.empresa_id = ${escopo.empresaId}
        ${dividaId ? sql`AND pd.divida_id = ${dividaId}` : sql``}
      ORDER BY pd.divida_id, pd.numero_parcela
    `);
    return [...linhas];
  }

  private async garantirFornecedor(transacao: TransacaoBancoDados, escopo: EscopoEmpresa, pessoaId: string): Promise<string> {
    const [linha] = await transacao.execute<{ id: string }>(sql`
      INSERT INTO fornecedores (empresa_id, pessoa_id)
      VALUES (${escopo.empresaId}, ${pessoaId})
      ON CONFLICT (empresa_id, pessoa_id) DO UPDATE SET empresa_id = EXCLUDED.empresa_id
      RETURNING id::text AS id
    `);
    return linha!.id;
  }

  /** Cria a conta do plano e a categoria de amortizacao na primeira vez que forem usadas. */
  private async garantirCategoriaDeAmortizacao(transacao: TransacaoBancoDados, escopo: EscopoEmpresa): Promise<string> {
    const [categoria] = await transacao
      .select({ id: categoriasFinanceiras.id })
      .from(categoriasFinanceiras)
      .where(and(eq(categoriasFinanceiras.empresaId, escopo.empresaId), eq(categoriasFinanceiras.nome, CATEGORIA_AMORTIZACAO)))
      .limit(1);
    if (categoria) return categoria.id;

    const [contaExistente] = await transacao
      .select({ id: contasPlano.id })
      .from(contasPlano)
      .where(and(eq(contasPlano.empresaId, escopo.empresaId), eq(contasPlano.codigo, CONTA_PLANO_AMORTIZACAO.codigo)))
      .limit(1);

    const contaPlanoId =
      contaExistente?.id ??
      (
        await transacao
          .insert(contasPlano)
          .values({
            empresaId: escopo.empresaId,
            codigo: CONTA_PLANO_AMORTIZACAO.codigo,
            nome: CONTA_PLANO_AMORTIZACAO.nome,
            grupoDre: "transferencia",
            ordem: 901,
          })
          .returning({ id: contasPlano.id })
      )[0]!.id;

    const [nova] = await transacao
      .insert(categoriasFinanceiras)
      .values({ empresaId: escopo.empresaId, nome: CATEGORIA_AMORTIZACAO, contaPlanoId, ordem: 901 })
      .returning({ id: categoriasFinanceiras.id });
    return nova!.id;
  }

  private async proximoCodigo(transacao: TransacaoBancoDados, escopo: EscopoEmpresa, data: DataCivil): Promise<string> {
    return this.gerarCodigo(transacao, escopo, data, PREFIXOS_CODIGO.divida);
  }

  private async proximoCodigoDeContaPagar(transacao: TransacaoBancoDados, escopo: EscopoEmpresa, data: DataCivil): Promise<string> {
    return this.gerarCodigo(transacao, escopo, data, PREFIXOS_CODIGO.contaPagar);
  }

  private async gerarCodigo(
    transacao: TransacaoBancoDados,
    escopo: EscopoEmpresa,
    data: DataCivil,
    prefixo: string,
  ): Promise<string> {
    const ano = Number(data.slice(0, 4));
    const [linha] = await transacao.execute<{ proximo: number }>(sql`
      INSERT INTO sequencias_codigo (empresa_id, prefixo, ano, ultimo_numero)
      VALUES (${escopo.empresaId}, ${prefixo}, ${ano}, 1)
      ON CONFLICT (empresa_id, prefixo, ano) DO UPDATE SET ultimo_numero = sequencias_codigo.ultimo_numero + 1
      RETURNING ultimo_numero AS proximo
    `);
    return formatarCodigo(prefixo, ano, Number(linha?.proximo ?? 1));
  }
}

interface LinhaDeParcela extends Record<string, unknown> {
  id: string;
  divida_id: string;
  numero: number;
  data_vencimento: string;
  valor_amortizacao: string;
  valor_juros: string;
  valor_total: string;
  situacao_divida: string;
  parcela_pagar_id: string | null;
  situacao_conta: string | null;
  valor_original: string | null;
  valor_pago: string | null;
}

/** A situacao da parcela vem da CONTA A PAGAR: e la que o pagamento acontece. */
function situacaoDaParcela(linha: LinhaDeParcela, hoje: DataCivil): SituacaoDerivada {
  if (linha.situacao_divida === "cancelada") return "cancelada";
  if (!linha.parcela_pagar_id || !linha.situacao_conta) return "aberta";
  return situacaoDerivada(
    {
      valorOriginal: Dinheiro.deTexto(linha.valor_original ?? linha.valor_total),
      valorBaixado: Dinheiro.deTexto(linha.valor_pago ?? "0"),
      dataVencimento: linha.data_vencimento as DataVencimento,
      situacaoGravada: linha.situacao_conta as "aberta" | "liquidada" | "cancelada" | "perdida",
    },
    hoje,
  );
}

/**
 * Quanto da amortizacao desta parcela ja foi pago.
 *
 * Proporcional ao que foi baixado, a mesma regra que o demonstrativo usa para
 * separar juros de amortizacao. Uma unica regra nos dois lugares e o que
 * mantem o saldo devedor e o resultado sempre coerentes entre si.
 */
function amortizacaoPagaDaLinha(linha: LinhaDeParcela): Dinheiro {
  const total = Dinheiro.deTexto(linha.valor_total);
  if (total.ehZero()) return Dinheiro.zero();
  const pago = Dinheiro.deTexto(linha.valor_pago ?? "0");
  if (pago.ehZero()) return Dinheiro.zero();
  const proporcao = Number(pago.paraTexto()) / Number(total.paraTexto());
  return Dinheiro.deTexto(linha.valor_amortizacao).multiplicarPorFator(Math.min(proporcao, 1).toFixed(10));
}

function jurosPagosDaLinha(linha: LinhaDeParcela): Dinheiro {
  const total = Dinheiro.deTexto(linha.valor_total);
  if (total.ehZero()) return Dinheiro.zero();
  const pago = Dinheiro.deTexto(linha.valor_pago ?? "0");
  if (pago.ehZero()) return Dinheiro.zero();
  const proporcao = Number(pago.paraTexto()) / Number(total.paraTexto());
  return Dinheiro.deTexto(linha.valor_juros).multiplicarPorFator(Math.min(proporcao, 1).toFixed(10));
}

interface CabecalhoDaDivida {
  id: string;
  codigo: string;
  credorNome: string;
  tipo: string;
  descricao: string;
  valorPrincipal: string;
  taxaMensal: string;
  sistema: string;
  quantidadeParcelas: number;
  situacao: string;
}

function montarResumo(cabecalho: CabecalhoDaDivida, linhas: readonly LinhaDeParcela[], hoje: DataCivil): DividaNaLista {
  const valorContratado = Dinheiro.deTexto(cabecalho.valorPrincipal);
  const amortizado = Dinheiro.somarTodos(linhas.map(amortizacaoPagaDaLinha));
  const saldo = valorContratado.subtrair(amortizado);

  const emAberto = linhas
    .filter((linha) => {
      const situacao = situacaoDaParcela(linha, hoje);
      return situacao !== "liquidada" && situacao !== "cancelada";
    })
    .sort((a, b) => compararDatas(a.data_vencimento as DataCivil, b.data_vencimento as DataCivil));

  const emAtraso = emAberto.filter((linha) => situacaoDaParcela(linha, hoje) === "vencida").length;
  const pagas = linhas.filter((linha) => situacaoDaParcela(linha, hoje) === "liquidada").length;
  const proxima = emAberto[0];

  const situacao: DividaNaLista["situacao"] =
    cabecalho.situacao === "cancelada"
      ? "cancelada"
      : saldo.ehZero() || emAberto.length === 0
        ? "quitada"
        : emAtraso > 0
          ? "em_atraso"
          : "em_dia";

  return {
    id: cabecalho.id,
    codigo: cabecalho.codigo,
    credorNome: cabecalho.credorNome,
    tipo: cabecalho.tipo,
    descricao: cabecalho.descricao,
    valorPrincipal: valorContratado,
    taxaMensal: Number(cabecalho.taxaMensal),
    sistema: cabecalho.sistema as SistemaAmortizacao,
    saldoDevedor: saldo.ehNegativo() ? Dinheiro.zero() : saldo,
    parcelasPagas: pagas,
    quantidadeParcelas: cabecalho.quantidadeParcelas,
    proximoVencimento: (proxima?.data_vencimento as DataVencimento | undefined) ?? null,
    proximaParcela: proxima ? Dinheiro.deTexto(proxima.valor_total) : null,
    situacao,
    parcelasEmAtraso: emAtraso,
  };
}
