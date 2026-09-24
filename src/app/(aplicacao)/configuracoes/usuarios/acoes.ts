"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ehErroDominio } from "@/compartilhado/erros/indice";
import { montarEnviadorEmail } from "@/composicao/email";
import { CredenciaisBetterAuth } from "@/nucleo/autenticacao/publico";
import { PAPEIS, type Papel } from "@/nucleo/autorizacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { linkDoConvite, montarMensagemRedefinicaoAcesso, RepositorioGestaoDeUsuariosDrizzle } from "@/nucleo/empresas/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("configuracoes-usuarios");

export interface EstadoUsuarios {
  readonly mensagem?: string;
  readonly sucesso?: string;
  /**
   * O link do convite, mostrado UMA vez.
   *
   * Ele nao volta: o banco guarda so o hash do token. Se a pessoa perder o
   * link, o caminho e gerar outro — que e o que "redefinir acesso" faz.
   */
  readonly link?: string;
  readonly campos?: Record<string, readonly string[]>;
}

function repositorio() {
  return new RepositorioGestaoDeUsuariosDrizzle(obterBancoDados(), new CredenciaisBetterAuth());
}

function texto(formulario: FormData, campo: string): string | undefined {
  const valor = formulario.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function mensagemDoErro(erro: unknown, padrao: string): string {
  if (ehErroDominio(erro)) return erro.message;
  logs.erro(padrao, { erro });
  return padrao;
}

const esquemaConvite = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  papel: z.enum(PAPEIS as unknown as [Papel, ...Papel[]]),
});

const esquemaAlvo = z.object({ usuarioId: z.string().min(1) });
const esquemaPapel = esquemaAlvo.extend({ papel: z.enum(PAPEIS as unknown as [Papel, ...Papel[]]) });
const esquemaSituacao = esquemaAlvo.extend({ ativo: z.enum(["sim", "nao"]) });

function atualizar() {
  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/configuracoes");
}

/**
 * Convida alguem por LINK de uso unico.
 *
 * O sistema nunca cria senha para ninguem: quem entra define a propria. Se
 * houver SMTP configurado, o link tambem vai por e-mail; sem SMTP, ele aparece
 * na tela para quem convidou repassar pelo canal que quiser.
 */
export async function acaoConvidar(_anterior: EstadoUsuarios, formulario: FormData): Promise<EstadoUsuarios> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");

  const analise = esquemaConvite.safeParse({ email: texto(formulario, "email"), papel: texto(formulario, "papel") });
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }

  try {
    const { token } = await repositorio().convidar(escopo, { ...analise.data, autorUsuarioId: usuarioId });
    atualizar();
    const variaveis = obterVariaveisAmbiente();
    return {
      sucesso: `Convite criado para ${analise.data.email}. O link vale por 48 horas e só pode ser usado uma vez.`,
      link: linkDoConvite(variaveis.APLICACAO_URL, token),
    };
  } catch (erro) {
    return { mensagem: mensagemDoErro(erro, "Não foi possível criar o convite.") };
  }
}

export async function acaoCancelarConvite(_anterior: EstadoUsuarios, formulario: FormData): Promise<EstadoUsuarios> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");
  const conviteId = texto(formulario, "conviteId");
  if (!conviteId) return { mensagem: "Pedido inválido." };

  try {
    await repositorio().cancelarConvite(escopo, conviteId, usuarioId);
  } catch (erro) {
    return { mensagem: mensagemDoErro(erro, "Não foi possível cancelar o convite.") };
  }

  atualizar();
  return { sucesso: "Convite cancelado. O link deixou de funcionar." };
}

export async function acaoAlterarPapel(_anterior: EstadoUsuarios, formulario: FormData): Promise<EstadoUsuarios> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");

  const analise = esquemaPapel.safeParse({ usuarioId: texto(formulario, "usuarioId"), papel: texto(formulario, "papel") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  try {
    await repositorio().alterarPapel(escopo, analise.data.usuarioId, analise.data.papel, usuarioId);
  } catch (erro) {
    return { mensagem: mensagemDoErro(erro, "Não foi possível alterar o papel.") };
  }

  atualizar();
  return { sucesso: "Papel alterado." };
}

export async function acaoAlterarSituacao(_anterior: EstadoUsuarios, formulario: FormData): Promise<EstadoUsuarios> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");

  const analise = esquemaSituacao.safeParse({ usuarioId: texto(formulario, "usuarioId"), ativo: texto(formulario, "ativo") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  const ativo = analise.data.ativo === "sim";
  try {
    await repositorio().alterarSituacao(escopo, analise.data.usuarioId, ativo, usuarioId);
  } catch (erro) {
    return { mensagem: mensagemDoErro(erro, "Não foi possível alterar o acesso.") };
  }

  atualizar();
  return {
    sucesso: ativo
      ? "Acesso reativado."
      : "Acesso desativado e sessões encerradas. O histórico da pessoa continua intacto.",
  };
}

/**
 * Redefine o acesso de quem ja tem conta: um link novo, nas regras do convite,
 * ENVIADO AO E-MAIL DA PESSOA.
 *
 * O link nunca volta para esta tela. Quem o tem define a senha da conta e
 * entra como a pessoa — inclusive nas outras organizacoes a que ela tiver
 * acesso. Entregue ao administrador, seria uma credencial de outra pessoa
 * nas maos dele: a trilha de auditoria passaria a registrar acoes suas em
 * nome de outro, e a separacao "quem registra nao aprova" cairia. Por isso,
 * sem servidor de e-mail nao ha redefinicao por aqui: o caminho e a propria
 * pessoa pedir em "Esqueci minha senha".
 */
export async function acaoRedefinirAcesso(_anterior: EstadoUsuarios, formulario: FormData): Promise<EstadoUsuarios> {
  const { escopo, usuarioId, nomeEmpresa } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");
  const alvo = texto(formulario, "usuarioId");
  if (!alvo) return { mensagem: "Pedido inválido." };

  const variaveis = obterVariaveisAmbiente();
  if (variaveis.EMAIL_PROVEDOR === "console") {
    return {
      mensagem:
        "Sem servidor de e-mail configurado, o link de redefinição não pode ser entregue à pessoa. Peça que ela use “Esqueci minha senha” na tela de entrada.",
    };
  }

  try {
    const { token, email } = await repositorio().redefinirAcesso(escopo, alvo, usuarioId);
    await montarEnviadorEmail().enviar(
      montarMensagemRedefinicaoAcesso({ para: email, token, aplicacaoUrl: variaveis.APLICACAO_URL, nomeDaEmpresa: nomeEmpresa }),
    );
    atualizar();
    return {
      sucesso: `Link de redefinição enviado para ${email}. Vale por 48 horas, serve uma vez e encerra as sessões abertas ao ser usado.`,
    };
  } catch (erro) {
    return { mensagem: mensagemDoErro(erro, "Não foi possível redefinir o acesso.") };
  }
}
