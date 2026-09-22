import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { compararDatas, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/* Tabelas de outros modulos vem do agregador: esquema nao e interface publica. */
import {
  categoriasFinanceiras,
  clientes,
  contasBancarias,
  contasPlano,
  fornecedores,
  movimentacoesBancarias,
  parcelasPagar,
  parcelasReceber,
  pessoas,
  titulosPagar,
  titulosReceber,
} from "@/banco-dados/esquemas/indice";
import type { ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import { gerarPeriodos } from "../dominio/periodos";
import type {
  FiltroFluxo,
  FluxoDeCaixa,
  LancamentoDoFluxo,
  LinhaDoFluxo,
  LinhaPorCategoria,
  ParcelaPrevista,
  RepositorioFluxoCaixa,
  TotaisEmAtraso,
} from "../aplicacao/repositorio-fluxo-caixa";

/**
 * Fluxo de caixa no PostgreSQL.
 *
 * Duas fontes, que nunca se misturam:
 *
 *   REALIZADO  `movimentacoes_bancarias` — dinheiro que JA entrou ou saiu,
 *              incluindo estornos, ajustes e transferencias. E a mesma fonte
 *              do extrato, e e por isso que o saldo final de um periodo
 *              realizado bate, ao centavo, com o saldo de `/bancos/[id]`.
 *   PREVISTO   parcelas em aberto por vencimento. Promessa, nao dinheiro.
 *
 * O QUE VENCEU E NAO FOI PAGO nao entra em nenhum dos dois. Jogar no passado
 * mentiria sobre o saldo de ontem; somar no futuro fingiria uma data que
 * ninguem combinou. Fica numa linha propria, "em atraso", para ser decidido.
 *
 * TRANSFERENCIA entre contas proprias aparece em coluna separada: olhando
 * UMA conta ela e dinheiro de verdade entrando ou saindo, mas nao e receita
 * nem despesa e some quando se olha o conjunto.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`.
 */
/**
 * A linha e transferencia entre contas proprias?
 *
 * `origem = 'transferencia'` cobre a ida. O ESTORNO de uma transferencia tem
 * `origem = 'estorno'` — e, sem esta segunda clausula, ele apareceria como
 * receita de um lado e despesa do outro. O saldo final continuaria certo
 * (as duas se anulam), mas as colunas "Entradas" e "Saidas" ficariam infladas
 * por dinheiro que nunca entrou nem saiu da empresa. Quem lesse o mes acharia
 * que faturou mais do que faturou.
 */
const EH_TRANSFERENCIA = sql`(
  ${movimentacoesBancarias.origem} = 'transferencia'
  OR EXISTS (
    SELECT 1 FROM movimentacoes_bancarias original
    WHERE original.id = ${movimentacoesBancarias.movimentacaoEstornadaId}
      AND original.origem = 'transferencia'
  )
)`;

export class RepositorioFluxoCaixaDrizzle implements RepositorioFluxoCaixa {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async montar(escopo: EscopoEmpresa, filtro: FiltroFluxo, hoje: DataCivil): Promise<FluxoDeCaixa> {
    const periodos = gerarPeriodos(filtro.de, filtro.ate, filtro.granularidade, hoje);
    const previstoDisponivel = !filtro.contaBancariaId;

    const [saldoAnterior, porDia, previstoPorDia, emAtraso, categorias, saldoAtual] = await Promise.all([
      this.saldoAntesDe(escopo, filtro, filtro.de),
      this.realizadoPorDia(escopo, filtro),
      previstoDisponivel ? this.previstoPorDia(escopo, filtro, hoje) : Promise.resolve(new Map<string, Previsto>()),
      this.totaisEmAtraso(escopo, hoje),
      this.aberturaPorCategoria(escopo, filtro, hoje),
      this.saldoDasContas(escopo, filtro),
    ]);

    let saldo = saldoAnterior;
    const linhas: LinhaDoFluxo[] = [];

    for (const periodo of periodos) {
      /*
       * Um periodo previsto soma DUAS coisas: as parcelas em aberto que vencem
       * nele e as movimentacoes ja lancadas com data futura (uma transferencia
       * agendada, por exemplo). A movimentacao futura e fato com data marcada,
       * nao promessa — e, se ficasse de fora, ela apareceria no saldo da conta
       * mas em periodo nenhum do fluxo, e as duas telas passariam a discordar.
       */
      const somas = periodo.natureza === "realizado"
        ? somarIntervalo(porDia, periodo.inicio, periodo.fim)
        : somarDois(
            somarIntervalo(previstoPorDia, periodo.inicio, periodo.fim),
            somarIntervalo(porDia, periodo.inicio, periodo.fim),
          );

      const saldoInicial = saldo;
      const saldoFinal = saldoInicial
        .somar(somas.entradas)
        .subtrair(somas.saidas)
        .somar(somas.transferenciasLiquidas);

      linhas.push({ ...periodo, saldoInicial, ...somas, saldoFinal });
      saldo = saldoFinal;
    }

    return { periodos: linhas, emAtraso, categorias, saldoAtual, previstoDisponivel };
  }

  // ------------------------------------------------------------- realizado

  private condicoesDaConta(escopo: EscopoEmpresa, filtro: FiltroFluxo): SQL[] {
    const condicoes: SQL[] = [eq(movimentacoesBancarias.empresaId, escopo.empresaId)];
    if (filtro.contaBancariaId) condicoes.push(eq(movimentacoesBancarias.contaBancariaId, filtro.contaBancariaId));
    return condicoes;
  }

  /**
   * Saldo no instante anterior ao inicio do periodo.
   *
   * E o saldo inicial das contas mais tudo que se moveu ANTES da data de
   * corte. Sem este ponto de partida, a primeira linha da tabela comecaria do
   * zero e o saldo final de todas as outras estaria errado.
   */
  private async saldoAntesDe(escopo: EscopoEmpresa, filtro: FiltroFluxo, corte: DataCivil): Promise<Dinheiro> {
    const contas = await this.banco
      .select({ total: sql<string>`COALESCE(SUM(${contasBancarias.saldoInicial}), 0)::text` })
      .from(contasBancarias)
      .where(and(...this.condicoesDeContasBancarias(escopo, filtro)));

    const movimentado = await this.banco
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${movimentacoesBancarias.tipo} = 'entrada' THEN ${movimentacoesBancarias.valor} ELSE -${movimentacoesBancarias.valor} END), 0)::text`,
      })
      .from(movimentacoesBancarias)
      .where(and(...this.condicoesDaConta(escopo, filtro), sql`${movimentacoesBancarias.dataMovimentacao} < ${corte}::date`));

    return Dinheiro.deTexto(contas[0]?.total ?? "0").somar(Dinheiro.deTexto(movimentado[0]?.total ?? "0"));
  }

  private condicoesDeContasBancarias(escopo: EscopoEmpresa, filtro: FiltroFluxo): SQL[] {
    const condicoes: SQL[] = [eq(contasBancarias.empresaId, escopo.empresaId)];
    if (filtro.contaBancariaId) condicoes.push(eq(contasBancarias.id, filtro.contaBancariaId));
    return condicoes;
  }

  private async saldoDasContas(escopo: EscopoEmpresa, filtro: FiltroFluxo): Promise<Dinheiro> {
    const [linha] = await this.banco.execute<{ saldo: string }>(sql`
      SELECT (
        COALESCE((SELECT SUM(c.saldo_inicial) FROM contas_bancarias c
                  WHERE c.empresa_id = ${escopo.empresaId}
                    ${filtro.contaBancariaId ? sql`AND c.id = ${filtro.contaBancariaId}` : sql``}), 0)
        + COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
                    FROM movimentacoes_bancarias m
                    WHERE m.empresa_id = ${escopo.empresaId}
                      ${filtro.contaBancariaId ? sql`AND m.conta_bancaria_id = ${filtro.contaBancariaId}` : sql``}), 0)
      )::text AS saldo
    `);
    return Dinheiro.deTexto(linha?.saldo ?? "0");
  }

  /**
   * Soma por DIA, e o agrupamento em semanas ou meses acontece depois, em
   * TypeScript.
   *
   * O periodo da tela tem no maximo algumas centenas de dias, entao o ganho de
   * agrupar no banco seria nenhum — e agrupar aqui evita duplicar em SQL a
   * definicao de "semana comeca na segunda", que ja vive no dominio e tem
   * teste proprio.
   */
  private async realizadoPorDia(escopo: EscopoEmpresa, filtro: FiltroFluxo): Promise<Map<string, Realizado>> {
    const linhas = await this.banco
      .select({
        dia: movimentacoesBancarias.dataMovimentacao,
        entradas: sql<string>`COALESCE(SUM(CASE WHEN ${movimentacoesBancarias.tipo} = 'entrada' AND NOT ${EH_TRANSFERENCIA} THEN ${movimentacoesBancarias.valor} ELSE 0 END), 0)::text`,
        saidas: sql<string>`COALESCE(SUM(CASE WHEN ${movimentacoesBancarias.tipo} = 'saida' AND NOT ${EH_TRANSFERENCIA} THEN ${movimentacoesBancarias.valor} ELSE 0 END), 0)::text`,
        transferencias: sql<string>`COALESCE(SUM(CASE WHEN ${EH_TRANSFERENCIA} THEN (CASE WHEN ${movimentacoesBancarias.tipo} = 'entrada' THEN ${movimentacoesBancarias.valor} ELSE -${movimentacoesBancarias.valor} END) ELSE 0 END), 0)::text`,
        quantidade: sql<number>`count(*)::int`,
      })
      .from(movimentacoesBancarias)
      .where(
        and(
          ...this.condicoesDaConta(escopo, filtro),
          gte(movimentacoesBancarias.dataMovimentacao, filtro.de),
          lte(movimentacoesBancarias.dataMovimentacao, filtro.ate),
        ),
      )
      .groupBy(movimentacoesBancarias.dataMovimentacao);

    const mapa = new Map<string, Realizado>();
    for (const linha of linhas) {
      mapa.set(String(linha.dia), {
        entradas: Dinheiro.deTexto(linha.entradas),
        saidas: Dinheiro.deTexto(linha.saidas),
        transferenciasLiquidas: Dinheiro.deTexto(linha.transferencias),
        quantidade: linha.quantidade,
      });
    }
    return mapa;
  }

  // -------------------------------------------------------------- previsto

  /**
   * Parcelas em aberto por vencimento, a partir de AMANHA.
   *
   * O que vence hoje ou antes ou ja foi pago (e entao e realizado) ou esta em
   * atraso (e entao tem linha propria). Somar aqui contaria o mesmo dinheiro
   * duas vezes.
   */
  private async previstoPorDia(escopo: EscopoEmpresa, filtro: FiltroFluxo, hoje: DataCivil): Promise<Map<string, Previsto>> {
    const linhas = await this.banco.execute<{ dia: string; entradas: string; saidas: string; quantidade: number }>(sql`
      SELECT dia, SUM(entradas)::text AS entradas, SUM(saidas)::text AS saidas, SUM(quantidade)::int AS quantidade
      FROM (
        SELECT p.data_vencimento AS dia, 0 AS entradas, (p.valor_original - p.valor_pago) AS saidas, 1 AS quantidade
        FROM parcelas_pagar p
        WHERE p.empresa_id = ${escopo.empresaId}
          AND p.situacao = 'aberta'
          AND p.valor_original > p.valor_pago
          AND p.data_vencimento > ${hoje}::date
          AND p.data_vencimento BETWEEN ${filtro.de}::date AND ${filtro.ate}::date
        UNION ALL
        SELECT r.data_vencimento AS dia, (r.valor_original - r.valor_recebido) AS entradas, 0 AS saidas, 1 AS quantidade
        FROM parcelas_receber r
        WHERE r.empresa_id = ${escopo.empresaId}
          AND r.situacao = 'aberta'
          AND r.valor_original > r.valor_recebido
          AND r.data_vencimento > ${hoje}::date
          AND r.data_vencimento BETWEEN ${filtro.de}::date AND ${filtro.ate}::date
      ) tudo
      GROUP BY dia
    `);

    const mapa = new Map<string, Previsto>();
    for (const linha of linhas) {
      mapa.set(String(linha.dia), {
        entradas: Dinheiro.deTexto(linha.entradas),
        saidas: Dinheiro.deTexto(linha.saidas),
        transferenciasLiquidas: Dinheiro.zero(),
        quantidade: Number(linha.quantidade),
      });
    }
    return mapa;
  }

  private async totaisEmAtraso(escopo: EscopoEmpresa, hoje: DataCivil): Promise<TotaisEmAtraso> {
    const [linha] = await this.banco.execute<{
      a_pagar: string; contagem_pagar: number; a_receber: string; contagem_receber: number;
    }>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN area = 'pagar' THEN saldo END), 0)::text AS a_pagar,
        COUNT(*) FILTER (WHERE area = 'pagar')::int AS contagem_pagar,
        COALESCE(SUM(CASE WHEN area = 'receber' THEN saldo END), 0)::text AS a_receber,
        COUNT(*) FILTER (WHERE area = 'receber')::int AS contagem_receber
      FROM (
        SELECT 'pagar' AS area, (p.valor_original - p.valor_pago) AS saldo
        FROM parcelas_pagar p
        WHERE p.empresa_id = ${escopo.empresaId} AND p.situacao = 'aberta'
          AND p.valor_original > p.valor_pago AND p.data_vencimento < ${hoje}::date
        UNION ALL
        SELECT 'receber', (r.valor_original - r.valor_recebido)
        FROM parcelas_receber r
        WHERE r.empresa_id = ${escopo.empresaId} AND r.situacao = 'aberta'
          AND r.valor_original > r.valor_recebido AND r.data_vencimento < ${hoje}::date
      ) vencidas
    `);

    return {
      aPagar: Dinheiro.deTexto(linha?.a_pagar ?? "0"),
      contagemAPagar: Number(linha?.contagem_pagar ?? 0),
      aReceber: Dinheiro.deTexto(linha?.a_receber ?? "0"),
      contagemAReceber: Number(linha?.contagem_receber ?? 0),
    };
  }

  private async aberturaPorCategoria(
    escopo: EscopoEmpresa,
    filtro: FiltroFluxo,
    hoje: DataCivil,
  ): Promise<readonly LinhaPorCategoria[]> {
    const ate = compararDatas(filtro.ate, hoje) < 0 ? filtro.ate : hoje;
    if (compararDatas(filtro.de, ate) > 0) return [];

    const linhas = await this.banco
      .select({
        categoriaNome: sql<string>`COALESCE(${categoriasFinanceiras.nome}, CASE WHEN ${EH_TRANSFERENCIA} THEN 'Transferências entre contas' ELSE 'Sem categoria' END)`,
        grupoDre: sql<string | null>`${contasPlano.grupoDre}::text`,
        entradas: sql<string>`COALESCE(SUM(CASE WHEN ${movimentacoesBancarias.tipo} = 'entrada' THEN ${movimentacoesBancarias.valor} ELSE 0 END), 0)::text`,
        saidas: sql<string>`COALESCE(SUM(CASE WHEN ${movimentacoesBancarias.tipo} = 'saida' THEN ${movimentacoesBancarias.valor} ELSE 0 END), 0)::text`,
      })
      .from(movimentacoesBancarias)
      .leftJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, movimentacoesBancarias.categoriaId))
      .leftJoin(contasPlano, eq(contasPlano.id, categoriasFinanceiras.contaPlanoId))
      .where(
        and(
          ...this.condicoesDaConta(escopo, filtro),
          gte(movimentacoesBancarias.dataMovimentacao, filtro.de),
          lte(movimentacoesBancarias.dataMovimentacao, ate),
        ),
      )
      .groupBy(categoriasFinanceiras.nome, contasPlano.grupoDre, movimentacoesBancarias.origem, movimentacoesBancarias.movimentacaoEstornadaId);

    // Uma categoria pode aparecer em mais de uma origem; junta aqui.
    const acumulado = new Map<string, LinhaPorCategoria>();
    for (const linha of linhas) {
      const atual = acumulado.get(linha.categoriaNome);
      const entradas = Dinheiro.deTexto(linha.entradas);
      const saidas = Dinheiro.deTexto(linha.saidas);
      acumulado.set(linha.categoriaNome, {
        categoriaNome: linha.categoriaNome,
        grupoDre: linha.grupoDre ?? atual?.grupoDre ?? null,
        entradas: (atual?.entradas ?? Dinheiro.zero()).somar(entradas),
        saidas: (atual?.saidas ?? Dinheiro.zero()).somar(saidas),
      });
    }

    return [...acumulado.values()]
      .filter((linha) => linha.entradas.ehPositivo() || linha.saidas.ehPositivo())
      .sort((a, b) => b.entradas.somar(b.saidas).comparar(a.entradas.somar(a.saidas)) || a.categoriaNome.localeCompare(b.categoriaNome));
  }

  // ---------------------------------------------------------- detalhamento

  async lancamentosDoPeriodo(
    escopo: EscopoEmpresa,
    filtro: FiltroFluxo,
    inicio: DataCivil,
    fim: DataCivil,
  ): Promise<readonly LancamentoDoFluxo[]> {
    const linhas = await this.banco
      .select({
        id: movimentacoesBancarias.id,
        data: movimentacoesBancarias.dataMovimentacao,
        descricao: movimentacoesBancarias.descricao,
        tipo: movimentacoesBancarias.tipo,
        valor: movimentacoesBancarias.valor,
        origem: movimentacoesBancarias.origem,
        contaBancariaId: movimentacoesBancarias.contaBancariaId,
        contaBancariaNome: contasBancarias.nome,
        categoriaNome: categoriasFinanceiras.nome,
      })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(contasBancarias.id, movimentacoesBancarias.contaBancariaId))
      .leftJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, movimentacoesBancarias.categoriaId))
      .where(
        and(
          ...this.condicoesDaConta(escopo, filtro),
          gte(movimentacoesBancarias.dataMovimentacao, inicio),
          lte(movimentacoesBancarias.dataMovimentacao, fim),
        ),
      )
      .orderBy(asc(movimentacoesBancarias.dataMovimentacao), asc(movimentacoesBancarias.criadoEm))
      .limit(500);

    return linhas.map(
      (linha): LancamentoDoFluxo => ({
        id: linha.id,
        data: linha.data as DataCivil,
        descricao: linha.descricao,
        tipo: linha.tipo,
        valor: Dinheiro.deTexto(linha.valor),
        origem: linha.origem,
        contaBancariaId: linha.contaBancariaId,
        contaBancariaNome: linha.contaBancariaNome,
        categoriaNome: linha.categoriaNome,
        rota: `/bancos/${linha.contaBancariaId}`,
      }),
    );
  }

  async parcelasDoPeriodo(
    escopo: EscopoEmpresa,
    inicio: DataCivil,
    fim: DataCivil,
    hoje: DataCivil,
  ): Promise<readonly ParcelaPrevista[]> {
    return this.parcelasEmAberto(
      escopo,
      and(
        sql`${parcelasPagar.dataVencimento} > ${hoje}::date`,
        gte(parcelasPagar.dataVencimento, inicio),
        lte(parcelasPagar.dataVencimento, fim),
      )!,
      and(
        sql`${parcelasReceber.dataVencimento} > ${hoje}::date`,
        gte(parcelasReceber.dataVencimento, inicio),
        lte(parcelasReceber.dataVencimento, fim),
      )!,
    );
  }

  async parcelasEmAtraso(escopo: EscopoEmpresa, hoje: DataCivil): Promise<readonly ParcelaPrevista[]> {
    return this.parcelasEmAberto(
      escopo,
      sql`${parcelasPagar.dataVencimento} < ${hoje}::date`,
      sql`${parcelasReceber.dataVencimento} < ${hoje}::date`,
    );
  }

  private async parcelasEmAberto(escopo: EscopoEmpresa, filtroPagar: SQL, filtroReceber: SQL): Promise<readonly ParcelaPrevista[]> {
    const [aPagar, aReceber] = await Promise.all([
      this.banco
        .select({
          parcelaId: parcelasPagar.id,
          codigo: titulosPagar.codigo,
          descricao: titulosPagar.descricao,
          pessoaNome: pessoas.nome,
          dataVencimento: parcelasPagar.dataVencimento,
          saldo: sql<string>`(${parcelasPagar.valorOriginal} - ${parcelasPagar.valorPago})::text`,
        })
        .from(parcelasPagar)
        .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
        .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
        .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
        .where(
          and(
            eq(parcelasPagar.empresaId, escopo.empresaId),
            eq(parcelasPagar.situacao, "aberta"),
            sql`${parcelasPagar.valorOriginal} > ${parcelasPagar.valorPago}`,
            filtroPagar,
          ),
        )
        .orderBy(asc(parcelasPagar.dataVencimento))
        .limit(300),
      this.banco
        .select({
          parcelaId: parcelasReceber.id,
          codigo: titulosReceber.codigo,
          descricao: titulosReceber.descricao,
          pessoaNome: pessoas.nome,
          dataVencimento: parcelasReceber.dataVencimento,
          saldo: sql<string>`(${parcelasReceber.valorOriginal} - ${parcelasReceber.valorRecebido})::text`,
        })
        .from(parcelasReceber)
        .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
        .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
        .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
        .where(
          and(
            eq(parcelasReceber.empresaId, escopo.empresaId),
            eq(parcelasReceber.situacao, "aberta"),
            sql`${parcelasReceber.valorOriginal} > ${parcelasReceber.valorRecebido}`,
            filtroReceber,
          ),
        )
        .orderBy(asc(parcelasReceber.dataVencimento))
        .limit(300),
    ]);

    const montar = (area: "pagar" | "receber") => (linha: Record<string, unknown>): ParcelaPrevista => ({
      parcelaId: String(linha.parcelaId),
      area,
      codigo: String(linha.codigo),
      descricao: String(linha.descricao),
      pessoaNome: String(linha.pessoaNome),
      dataVencimento: String(linha.dataVencimento) as DataCivil,
      saldo: Dinheiro.deTexto(String(linha.saldo)),
      rota: `/contas-${area}/${String(linha.parcelaId)}`,
    });

    return [...aPagar.map(montar("pagar")), ...aReceber.map(montar("receber"))].sort((a, b) =>
      compararDatas(a.dataVencimento, b.dataVencimento),
    );
  }
}

interface Realizado {
  readonly entradas: Dinheiro;
  readonly saidas: Dinheiro;
  readonly transferenciasLiquidas: Dinheiro;
  readonly quantidade: number;
}

type Previsto = Realizado;

function somarIntervalo(mapa: Map<string, Realizado>, inicio: DataCivil, fim: DataCivil): Realizado {
  let entradas = Dinheiro.zero();
  let saidas = Dinheiro.zero();
  let transferenciasLiquidas = Dinheiro.zero();
  let quantidade = 0;

  for (const [dia, somas] of mapa) {
    if (dia < inicio || dia > fim) continue;
    entradas = entradas.somar(somas.entradas);
    saidas = saidas.somar(somas.saidas);
    transferenciasLiquidas = transferenciasLiquidas.somar(somas.transferenciasLiquidas);
    quantidade += somas.quantidade;
  }

  return { entradas, saidas, transferenciasLiquidas, quantidade };
}

function somarDois(a: Realizado, b: Realizado): Realizado {
  return {
    entradas: a.entradas.somar(b.entradas),
    saidas: a.saidas.somar(b.saidas),
    transferenciasLiquidas: a.transferenciasLiquidas.somar(b.transferenciasLiquidas),
    quantidade: a.quantidade + b.quantidade,
  };
}
