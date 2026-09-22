"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const esquemaEdicao = esquema.extend({
  contaId: z.string().uuid(),
});

/**
 * Edicao do cadastro da conta — e do saldo inicial, ENQUANTO ela nao tiver
 * movimentacao.
 *
 * Depois da primeira movimentacao o repositorio recusa mexer no saldo inicial.
 * A tela ja mostra o campo como somente leitura, mas o controle esta la: um
 * POST direto tambem e recusado.
 */
export async function acaoEditarContaBancaria(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo } = await exigirContextoFinanceiro("bancos.editar", "/bancos");

  const analise = esquemaEdicao.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }

  const ehCaixa = analise.data.tipo === "caixa";
  if (!ehCaixa && !analise.data.instituicaoNome) {
    return { mensagem: "Confira os campos destacados.", campos: { instituicaoNome: ["Informe o banco desta conta."] } };
  }

  let saldo: Dinheiro | undefined;
  try {
    saldo = analise.data.saldoInicial?.trim() ? Dinheiro.deTextoBrasileiro(analise.data.saldoInicial) : undefined;
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { saldoInicial: ["Valor inválido."] } };
  }

  try {
    const bancos = repositorios.bancos();
    const instituicaoId =
      !ehCaixa && analise.data.instituicaoNome
        ? (await bancos.garantirInstituicao(analise.data.instituicaoNome)).instituicaoId
        : undefined;

    await bancos.editar(escopo, analise.data.contaId, {
      nome: analise.data.nome,
      tipo: analise.data.tipo,
      ...(instituicaoId ? { instituicaoBancariaId: instituicaoId } : {}),
      ...(analise.data.agencia ? { agencia: analise.data.agencia } : {}),
      ...(analise.data.numeroConta ? { numeroConta: analise.data.numeroConta } : {}),
      ...(saldo ? { saldoInicial: saldo } : {}),
      ...(analise.data.dataSaldoInicial ? { dataSaldoInicial: dataCivilDeTexto(analise.data.dataSaldoInicial) } : {}),
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao editar conta bancaria", { erro: codigo });
    return { mensagem: "Não foi possível salvar a conta agora. Tente novamente em instantes." };
  }

  revalidatePath("/bancos");
  revalidatePath(`/bancos/${analise.data.contaId}`);
  redirect(`/bancos/${analise.data.contaId}`);
}

const esquemaAjuste = z.object({
  contaId: z.string().uuid(),
  tipo: z.enum(["entrada", "saida"]),
  valor: z.string().min(1, "Informe o valor do ajuste."),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do ajuste."),
  motivo: z.string().trim().min(5, "Explique o motivo do ajuste (mínimo 5 letras)."),
});

/**
 * Lancamento de ajuste de saldo.
 *
 * E a forma CERTA de corrigir o saldo de uma conta que ja tem movimentacao:
 * em vez de mudar a base do calculo em silencio, cria-se um lancamento
 * visivel, datado e com motivo, que aparece no extrato como "Ajuste de saldo".
 */
export async function acaoAjustarSaldo(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.editar", "/bancos");

  const analise = esquemaAjuste.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }

  let valor: Dinheiro;
  try {
    valor = Dinheiro.deTextoBrasileiro(analise.data.valor);
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor inválido."] } };
  }
  if (!valor.ehPositivo()) {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };
  }

  try {
    await repositorios.bancos().registrarAjuste(escopo, analise.data.contaId, {
      tipo: analise.data.tipo,
      valor,
      data: dataCivilDeTexto(analise.data.data),
      motivo: analise.data.motivo,
      usuarioId,
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao ajustar saldo", { erro: codigo });
    return { mensagem: "Não foi possível registrar o ajuste agora. Tente novamente em instantes." };
  }

  revalidatePath("/bancos");
  revalidatePath(`/bancos/${analise.data.contaId}`);
  redirect(`/bancos/${analise.data.contaId}`);
}

const esquemaTransferencia = z.object({
  contaOrigemId: z.string().uuid("Escolha a conta de origem."),
  contaDestinoId: z.string().uuid("Escolha a conta de destino."),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  valor: z.string().min(1, "Informe o valor."),
  descricao: z.string().trim().optional(),
});

const esquemaEstornoTransferencia = z.object({
  transferenciaId: z.string().uuid(),
  motivo: z.string().trim().min(5, "Explique o motivo do estorno (mínimo 5 letras)."),
});

/**
 * Transferencia entre contas proprias. Exige `bancos.editar`.
 *
 * O catalogo nao tem `bancos.transferir`, e inventar permissao nova mudaria o
 * modelo de seguranca sem que ninguem decidisse isso. A permissao usada e a
 * mesma do ajuste de saldo do Gate 5.1, que tambem cria movimentacao. Uma
 * permissao separada esta proposta na entrega do gate.
 */
export async function acaoCriarTransferencia(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.editar", "/bancos");

  const analise = esquemaTransferencia.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }

  let valor: Dinheiro;
  try {
    valor = Dinheiro.deTextoBrasileiro(analise.data.valor);
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor inválido."] } };
  }
  if (!valor.ehPositivo()) {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };
  }

  let destino = "";
  try {
    const { transferenciaId } = await repositorios.bancos().criarTransferencia(escopo, {
      contaOrigemId: analise.data.contaOrigemId,
      contaDestinoId: analise.data.contaDestinoId,
      data: dataCivilDeTexto(analise.data.data),
      valor,
      ...(analise.data.descricao ? { descricao: analise.data.descricao } : {}),
      usuarioId,
    });
    destino = transferenciaId;
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao transferir", { erro: codigo });
    return { mensagem: "Não foi possível transferir agora. Tente novamente em instantes." };
  }

  revalidatePath("/bancos");
  revalidatePath("/fluxo-de-caixa");
  redirect(`/bancos?transferencia=${destino}`);
}

/** Estorno de transferencia: devolve o dinheiro nas duas contas. Exige `bancos.editar`. */
export async function acaoEstornarTransferencia(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, hoje, usuarioId } = await exigirContextoFinanceiro("bancos.editar", "/bancos");

  const analise = esquemaEstornoTransferencia.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }

  try {
    await repositorios.bancos().estornarTransferencia(escopo, analise.data.transferenciaId, {
      motivo: analise.data.motivo,
      dataEstorno: hoje,
      usuarioId,
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao estornar transferencia", { erro: codigo });
    return { mensagem: "Não foi possível estornar agora. Tente novamente em instantes." };
  }

  revalidatePath("/bancos");
  revalidatePath("/fluxo-de-caixa");
  redirect("/bancos");
}

const MENSAGENS_DE_RECUSA: Record<string, string> = {
  CONTA_BANCARIA_NAO_ENCONTRADA: "Esta conta bancária não foi encontrada.",
  SALDO_INICIAL_BLOQUEADO:
    "Esta conta já tem movimentação, então o saldo inicial não pode mais ser alterado. Registre um lançamento de ajuste.",
  VALOR_INVALIDO: "O valor precisa ser maior que zero.",
  MOTIVO_OBRIGATORIO: "Explique o motivo do ajuste.",
  CONTAS_IGUAIS: "Escolha duas contas diferentes.",
  TRANSFERENCIA_NAO_ENCONTRADA: "Esta transferência não foi encontrada.",
  TRANSFERENCIA_JA_ESTORNADA: "Esta transferência já foi estornada.",
  TRANSFERENCIA_CONCILIADA:
    "Uma das pontas desta transferência já foi conciliada com o extrato. Desfaça a conciliação antes de estornar.",
};
