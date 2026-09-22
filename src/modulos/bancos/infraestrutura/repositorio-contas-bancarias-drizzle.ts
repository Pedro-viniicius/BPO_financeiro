import { and, asc, eq, sql } from "drizzle-orm";

import type { DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import { deslocamento, type EscopoEmpresa, type PaginaResultado, type Paginacao } from "@/compartilhado/tipos/indice";
/* Tabelas de outro modulo vem do agregador: esquema nao e interface publica. */
import { categoriasFinanceiras, contasPlano } from "@/banco-dados/esquemas/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type BancoDados, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type {
  ContaBancariaNaLista,
  DadosAjusteDeSaldo,
  DadosEdicaoContaBancaria,
  DadosNovaContaBancaria,
  LinhaDoExtrato,
  RepositorioContasBancarias,
} from "../aplicacao/repositorio-contas-bancarias";
import { contasBancarias, instituicoesBancarias, movimentacoesBancarias } from "./esquema";

/**
 * Codigo e nome da classificacao usada pelos lancamentos de ajuste.
 *
 * O modelo EXIGE categoria para `origem = 'ajuste_manual'` (CHECK
 * `verifica_movimentacoes_categoria`) — e com razao: movimentacao sem
 * classificacao e dinheiro que ninguem sabe explicar no fim do mes.
 *
 * Mas ajuste tambem nao e receita nem despesa: e conserto de uma base que
 * estava errada. Por isso a categoria aponta para uma conta do plano no grupo
 * `transferencia`, o unico grupo que o proprio modelo descreve como "nao entra
 * na DRE". O Gate 7 monta o resultado a partir do grupo, entao o ajuste fica
 * de fora sem precisar de nenhuma excecao escrita la.
 */
const CONTA_PLANO_AJUSTE = { codigo: "9.9.01", nome: "Ajustes de saldo" } as const;
const CATEGORIA_AJUSTE = "Ajuste de saldo";

/**
 * Contas bancarias no PostgreSQL.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`, inclusive
 * `buscarPorId` — e o que impede pagar uma conta usando a conta bancaria de
 * outra empresa informando o UUID.
 */
export class RepositorioContasBancariasDrizzle implements RepositorioContasBancarias {
  constructor(private readonly banco: BancoDados) {}

  /**
   * O saldo sai de `saldo_inicial + entradas - saidas`, calculado na consulta.
   * Movimentacoes estornadas continuam somando porque o estorno gera uma
   * movimentacao inversa: as duas se anulam sozinhas.
   */
  private selecaoComSaldo() {
    const somaMovimentacoes = sql<string>`
      COALESCE((
        SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
        FROM ${movimentacoesBancarias} m
        WHERE m.conta_bancaria_id = ${contasBancarias.id}
      ), 0)
    `;
    const quantidadeMovimentacoes = sql<number>`
      (SELECT COUNT(*)::int FROM ${movimentacoesBancarias} m WHERE m.conta_bancaria_id = ${contasBancarias.id})
    `;
    return {
      id: contasBancarias.id,
      nome: contasBancarias.nome,
      tipo: contasBancarias.tipo,
      instituicaoNome: instituicoesBancarias.nome,
      instituicaoBancariaId: contasBancarias.instituicaoBancariaId,
      agencia: contasBancarias.agencia,
      numeroConta: contasBancarias.numeroConta,
      saldoInicial: contasBancarias.saldoInicial,
      dataSaldoInicial: contasBancarias.dataSaldoInicial,
      movimentado: somaMovimentacoes,
      movimentacoes: quantidadeMovimentacoes,
      ativa: contasBancarias.ativa,
    };
  }

  private montar(linha: {
    id: string; nome: string; tipo: string; instituicaoNome: string | null; instituicaoBancariaId: string | null;
    agencia: string | null; numeroConta: string | null; saldoInicial: string; dataSaldoInicial: string;
    movimentado: string; movimentacoes: number; ativa: boolean;
  }): ContaBancariaNaLista {
    const saldoInicial = Dinheiro.deTexto(linha.saldoInicial);
    return {
      id: linha.id,
      nome: linha.nome,
      tipo: linha.tipo,
      instituicaoNome: linha.instituicaoNome,
      instituicaoBancariaId: linha.instituicaoBancariaId,
      agencia: linha.agencia,
      numeroConta: linha.numeroConta,
      saldoInicial,
      dataSaldoInicial: linha.dataSaldoInicial as DataCivil,
      saldoAtual: saldoInicial.somar(Dinheiro.deTexto(String(linha.movimentado))),
      saldoInicialEditavel: linha.movimentacoes === 0,
      ativa: linha.ativa,
    };
  }

  async listar(escopo: EscopoEmpresa): Promise<readonly ContaBancariaNaLista[]> {
    const linhas = await this.banco
      .select(this.selecaoComSaldo())
      .from(contasBancarias)
      .leftJoin(instituicoesBancarias, eq(instituicoesBancarias.id, contasBancarias.instituicaoBancariaId))
      .where(eq(contasBancarias.empresaId, escopo.empresaId))
      .orderBy(asc(contasBancarias.nome));
    return linhas.map((l) => this.montar(l));
  }

  async buscarPorId(escopo: EscopoEmpresa, id: string): Promise<ContaBancariaNaLista | null> {
    const [linha] = await this.banco
      .select(this.selecaoComSaldo())
      .from(contasBancarias)
      .leftJoin(instituicoesBancarias, eq(instituicoesBancarias.id, contasBancarias.instituicaoBancariaId))
      .where(and(eq(contasBancarias.id, id), eq(contasBancarias.empresaId, escopo.empresaId)))
      .limit(1);
    return linha ? this.montar(linha) : null;
  }

  async criar(escopo: EscopoEmpresa, dados: DadosNovaContaBancaria): Promise<{ contaId: string }> {
    const [conta] = await this.banco
      .insert(contasBancarias)
      .values({
        empresaId: escopo.empresaId,
        tipo: dados.tipo,
        nome: dados.nome,
        instituicaoBancariaId: dados.instituicaoBancariaId ?? null,
        agencia: dados.agencia ?? null,
        numeroConta: dados.numeroConta ?? null,
        saldoInicial: dados.saldoInicial.paraTexto(),
        dataSaldoInicial: dados.dataSaldoInicial,
      })
      .returning({ id: contasBancarias.id });
    return { contaId: conta!.id };
  }

  /**
   * Edicao do cadastro e, ENQUANTO A CONTA ESTIVER ZERADA DE MOVIMENTO, do
   * saldo inicial.
   *
   * Depois da primeira movimentacao o saldo inicial trava. Ele e a base de
   * todo o historico: muda-lo recalcularia em silencio o saldo de todos os
   * meses ja fechados, e quem conferiu o mes passado veria outro numero hoje.
   * A correcao certa passa a ser `registrarAjuste`, que aparece no extrato.
   */
  async editar(escopo: EscopoEmpresa, id: string, dados: DadosEdicaoContaBancaria): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [conta] = await transacao
        .select({
          id: contasBancarias.id,
          saldoInicial: contasBancarias.saldoInicial,
          dataSaldoInicial: contasBancarias.dataSaldoInicial,
        })
        .from(contasBancarias)
        .where(and(eq(contasBancarias.id, id), eq(contasBancarias.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");

      const mexeNoSaldo =
        (dados.saldoInicial !== undefined && dados.saldoInicial.paraTexto() !== Dinheiro.deTexto(conta.saldoInicial).paraTexto()) ||
        (dados.dataSaldoInicial !== undefined && dados.dataSaldoInicial !== conta.dataSaldoInicial);

      if (mexeNoSaldo && (await this.contarMovimentacoes(transacao, escopo, id)) > 0) {
        throw new Error("SALDO_INICIAL_BLOQUEADO");
      }

      await transacao
        .update(contasBancarias)
        .set({
          nome: dados.nome,
          tipo: dados.tipo,
          instituicaoBancariaId: dados.instituicaoBancariaId ?? null,
          agencia: dados.agencia ?? null,
          numeroConta: dados.numeroConta ?? null,
          ...(mexeNoSaldo && dados.saldoInicial ? { saldoInicial: dados.saldoInicial.paraTexto() } : {}),
          ...(mexeNoSaldo && dados.dataSaldoInicial ? { dataSaldoInicial: dados.dataSaldoInicial } : {}),
          atualizadoEm: new Date(),
        })
        .where(and(eq(contasBancarias.id, id), eq(contasBancarias.empresaId, escopo.empresaId)));
    }, this.banco);
  }

  /**
   * Extrato com saldo acumulado.
   *
   * O saldo linha a linha vem de uma funcao de janela no proprio PostgreSQL.
   * Somar em TypeScript daria o numero errado assim que houvesse paginacao: a
   * pagina 2 comecaria do zero, ignorando tudo que veio antes.
   */
  async extrato(escopo: EscopoEmpresa, contaId: string, paginacao: Paginacao): Promise<PaginaResultado<LinhaDoExtrato>> {
    const [conta] = await this.banco
      .select({ id: contasBancarias.id, saldoInicial: contasBancarias.saldoInicial })
      .from(contasBancarias)
      .where(and(eq(contasBancarias.id, contaId), eq(contasBancarias.empresaId, escopo.empresaId)))
      .limit(1);
    if (!conta) return { itens: [], total: 0, pagina: paginacao.pagina, tamanho: paginacao.tamanho };

    const linhas = await this.banco.execute<{
      id: string;
      data: string;
      tipo: "entrada" | "saida";
      valor: string;
      descricao: string;
      origem: string;
      observacoes: string | null;
      saldo_acumulado: string;
      eh_estorno: boolean;
    }>(sql`
      SELECT id, data, tipo, valor, descricao, origem, observacoes, saldo_acumulado, eh_estorno
      FROM (
        SELECT
          m.id,
          m.data_movimentacao AS data,
          m.tipo,
          m.valor,
          m.descricao,
          m.origem::text AS origem,
          m.observacoes,
          m.movimentacao_estornada_id IS NOT NULL AS eh_estorno,
          ${conta.saldoInicial}::numeric
            + SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
              OVER (ORDER BY m.data_movimentacao, m.criado_em, m.id ROWS UNBOUNDED PRECEDING) AS saldo_acumulado,
          m.data_movimentacao,
          m.criado_em
        FROM movimentacoes_bancarias m
        WHERE m.conta_bancaria_id = ${contaId} AND m.empresa_id = ${escopo.empresaId}
      ) linhas
      ORDER BY data_movimentacao, criado_em, id
      LIMIT ${paginacao.tamanho} OFFSET ${deslocamento(paginacao)}
    `);

    const [contagem] = await this.banco
      .select({ total: sql<number>`count(*)::int` })
      .from(movimentacoesBancarias)
      .where(and(eq(movimentacoesBancarias.contaBancariaId, contaId), eq(movimentacoesBancarias.empresaId, escopo.empresaId)));

    return {
      itens: [...linhas].map(
        (linha): LinhaDoExtrato => ({
          id: linha.id,
          data: linha.data as DataCivil,
          tipo: linha.tipo,
          valor: Dinheiro.deTexto(linha.valor),
          descricao: linha.descricao,
          origem: linha.origem,
          observacoes: linha.observacoes,
          saldoAcumulado: Dinheiro.deTexto(linha.saldo_acumulado),
          ehEstorno: linha.eh_estorno,
        }),
      ),
      total: contagem?.total ?? 0,
      pagina: paginacao.pagina,
      tamanho: paginacao.tamanho,
    };
  }

  async registrarAjuste(escopo: EscopoEmpresa, contaId: string, dados: DadosAjusteDeSaldo): Promise<{ movimentacaoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [conta] = await transacao
        .select({ id: contasBancarias.id, nome: contasBancarias.nome })
        .from(contasBancarias)
        .where(and(eq(contasBancarias.id, contaId), eq(contasBancarias.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");
      if (!dados.valor.ehPositivo()) throw new Error("VALOR_INVALIDO");
      if (!dados.motivo.trim()) throw new Error("MOTIVO_OBRIGATORIO");

      const categoriaId = await this.garantirCategoriaDeAjuste(transacao, escopo);

      const [movimentacao] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: contaId,
          dataMovimentacao: dados.data,
          tipo: dados.tipo,
          valor: dados.valor.paraTexto(),
          descricao: "Ajuste de saldo",
          origem: "ajuste_manual",
          categoriaId,
          observacoes: dados.motivo.trim(),
        })
        .returning({ id: movimentacoesBancarias.id });

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_bancaria.saldo_ajustado",
        entidade: "conta_bancaria",
        entidadeId: contaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          tipo: dados.tipo,
          valor: dados.valor.paraTexto(),
          data: dados.data,
          motivo: dados.motivo.trim(),
          movimentacaoId: movimentacao!.id,
        },
      });

      return { movimentacaoId: movimentacao!.id };
    }, this.banco);
  }

  async garantirInstituicao(nome: string): Promise<{ instituicaoId: string }> {
    const limpo = nome.trim();
    const [existente] = await this.banco
      .select({ id: instituicoesBancarias.id })
      .from(instituicoesBancarias)
      .where(eq(instituicoesBancarias.nome, limpo))
      .limit(1);
    if (existente) return { instituicaoId: existente.id };

    const [nova] = await this.banco
      .insert(instituicoesBancarias)
      .values({ nome: limpo })
      .returning({ id: instituicoesBancarias.id });
    return { instituicaoId: nova!.id };
  }

  async listarInstituicoes(): Promise<readonly { id: string; nome: string }[]> {
    // Dado de referencia (lista do Banco Central), nao pertence a empresa.
    return this.banco
      .select({ id: instituicoesBancarias.id, nome: instituicoesBancarias.nome })
      .from(instituicoesBancarias)
      .where(eq(instituicoesBancarias.ativa, true))
      .orderBy(asc(instituicoesBancarias.nome));
  }

  // ---- apoio ----

  private async contarMovimentacoes(executor: ExecutorBancoDados, escopo: EscopoEmpresa, contaId: string): Promise<number> {
    const [linha] = await executor
      .select({ total: sql<number>`count(*)::int` })
      .from(movimentacoesBancarias)
      .where(and(eq(movimentacoesBancarias.contaBancariaId, contaId), eq(movimentacoesBancarias.empresaId, escopo.empresaId)));
    return linha?.total ?? 0;
  }

  /** Cria a conta do plano e a categoria de ajuste na primeira vez que forem usadas. */
  private async garantirCategoriaDeAjuste(executor: ExecutorBancoDados, escopo: EscopoEmpresa): Promise<string> {
    const [categoria] = await executor
      .select({ id: categoriasFinanceiras.id })
      .from(categoriasFinanceiras)
      .where(and(eq(categoriasFinanceiras.empresaId, escopo.empresaId), eq(categoriasFinanceiras.nome, CATEGORIA_AJUSTE)))
      .limit(1);
    if (categoria) return categoria.id;

    const [contaExistente] = await executor
      .select({ id: contasPlano.id })
      .from(contasPlano)
      .where(and(eq(contasPlano.empresaId, escopo.empresaId), eq(contasPlano.codigo, CONTA_PLANO_AJUSTE.codigo)))
      .limit(1);

    const contaPlanoId =
      contaExistente?.id ??
      (
        await executor
          .insert(contasPlano)
          .values({
            empresaId: escopo.empresaId,
            codigo: CONTA_PLANO_AJUSTE.codigo,
            nome: CONTA_PLANO_AJUSTE.nome,
            grupoDre: "transferencia",
            ordem: 900,
          })
          .returning({ id: contasPlano.id })
      )[0]!.id;

    const [nova] = await executor
      .insert(categoriasFinanceiras)
      .values({ empresaId: escopo.empresaId, nome: CATEGORIA_AJUSTE, contaPlanoId, ordem: 900 })
      .returning({ id: categoriasFinanceiras.id });
    return nova!.id;
  }
}
