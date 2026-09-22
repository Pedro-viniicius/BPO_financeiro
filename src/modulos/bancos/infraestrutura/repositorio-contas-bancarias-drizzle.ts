import { and, asc, eq, sql } from "drizzle-orm";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { BancoDados } from "@/nucleo/banco-dados/publico";

import type {
  ContaBancariaNaLista,
  DadosNovaContaBancaria,
  RepositorioContasBancarias,
} from "../aplicacao/repositorio-contas-bancarias";
import { contasBancarias, instituicoesBancarias, movimentacoesBancarias } from "./esquema";

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
    return {
      id: contasBancarias.id,
      nome: contasBancarias.nome,
      tipo: contasBancarias.tipo,
      instituicaoNome: instituicoesBancarias.nome,
      agencia: contasBancarias.agencia,
      numeroConta: contasBancarias.numeroConta,
      saldoInicial: contasBancarias.saldoInicial,
      movimentado: somaMovimentacoes,
      ativa: contasBancarias.ativa,
    };
  }

  private montar(linha: {
    id: string; nome: string; tipo: string; instituicaoNome: string | null;
    agencia: string | null; numeroConta: string | null; saldoInicial: string; movimentado: string; ativa: boolean;
  }): ContaBancariaNaLista {
    return {
      id: linha.id,
      nome: linha.nome,
      tipo: linha.tipo,
      instituicaoNome: linha.instituicaoNome,
      agencia: linha.agencia,
      numeroConta: linha.numeroConta,
      saldoAtual: Dinheiro.deTexto(linha.saldoInicial).somar(Dinheiro.deTexto(String(linha.movimentado))),
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

  async editar(
    escopo: EscopoEmpresa,
    id: string,
    dados: Omit<DadosNovaContaBancaria, "saldoInicial" | "dataSaldoInicial">,
  ): Promise<void> {
    // Saldo inicial e data NAO sao editaveis: mudar a base recalcularia todo o
    // historico de saldo em silencio. Para corrigir, a operacao correta e um
    // lancamento de ajuste, que fica visivel no extrato.
    await this.banco
      .update(contasBancarias)
      .set({
        nome: dados.nome,
        tipo: dados.tipo,
        instituicaoBancariaId: dados.instituicaoBancariaId ?? null,
        agencia: dados.agencia ?? null,
        numeroConta: dados.numeroConta ?? null,
        atualizadoEm: new Date(),
      })
      .where(and(eq(contasBancarias.id, id), eq(contasBancarias.empresaId, escopo.empresaId)));
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
}
