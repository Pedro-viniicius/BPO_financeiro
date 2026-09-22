"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("bancos");

export interface EstadoFormulario {
  readonly mensagem?: string;
  readonly sucesso?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const TIPOS = ["conta_corrente", "conta_poupanca", "conta_pagamento", "aplicacao", "caixa"] as const;

const esquema = z.object({
  nome: z.string().trim().min(2, "Informe um nome para a conta."),
  tipo: z.enum(TIPOS),
  instituicaoNome: z.string().trim().optional(),
  agencia: z.string().trim().optional(),
  numeroConta: z.string().trim().optional(),
  saldoInicial: z.string().optional(),
  dataSaldoInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do saldo inicial."),
});

export async function acaoCriarContaBancaria(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo } = await exigirContextoFinanceiro("bancos.editar", "/bancos");

  const analise = esquema.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }

  const ehCaixa = analise.data.tipo === "caixa";
  // Regra do banco (CHECK verifica_contas_bancarias_instituicao): caixa NAO
  // tem instituicao; qualquer outro tipo PRECISA ter. Verificamos aqui para a
  // pessoa receber uma frase, e nao um erro de constraint.
  if (!ehCaixa && !analise.data.instituicaoNome) {
    return { mensagem: "Confira os campos destacados.", campos: { instituicaoNome: ["Informe o banco desta conta."] } };
  }

  let saldo: Dinheiro;
  try {
    saldo = analise.data.saldoInicial?.trim() ? Dinheiro.deTextoBrasileiro(analise.data.saldoInicial) : Dinheiro.zero();
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { saldoInicial: ["Valor inválido."] } };
  }

  try {
    const bancos = repositorios.bancos();
    const instituicaoId =
      !ehCaixa && analise.data.instituicaoNome
        ? (await bancos.garantirInstituicao(analise.data.instituicaoNome)).instituicaoId
        : undefined;

    await bancos.criar(escopo, {
      nome: analise.data.nome,
      tipo: analise.data.tipo,
      ...(instituicaoId ? { instituicaoBancariaId: instituicaoId } : {}),
      ...(analise.data.agencia ? { agencia: analise.data.agencia } : {}),
      ...(analise.data.numeroConta ? { numeroConta: analise.data.numeroConta } : {}),
      saldoInicial: saldo,
      dataSaldoInicial: dataCivilDeTexto(analise.data.dataSaldoInicial),
    });
  } catch (erro) {
    logs.erro("falha ao criar conta bancaria", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar a conta agora. Tente novamente em instantes." };
  }

  revalidatePath("/bancos");
  return { sucesso: `Conta ${analise.data.nome} cadastrada.` };
}
