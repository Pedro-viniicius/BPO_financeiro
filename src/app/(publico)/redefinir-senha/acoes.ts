"use server";

import { redirect } from "next/navigation";

import { redefinirSenha, TAMANHO_MINIMO_SENHA } from "@/nucleo/autenticacao/publico";
import { ROTAS } from "@/nucleo/empresas/publico";

export interface EstadoFormularioRedefinir {
  readonly mensagem?: string;
  /** Quando o link nao vale mais, a tela oferece pedir outro em vez de tentar de novo. */
  readonly linkInvalido?: boolean;
}

/**
 * Troca a senha usando o token do e-mail.
 *
 * O Better Auth revoga as sessoes existentes na troca
 * (`revokeSessionsOnPasswordReset`), entao quem tomou a conta perde o acesso.
 * Por isso a tela leva para `/entrar`, e nao direto para dentro.
 */
export async function acaoRedefinirSenha(
  _anterior: EstadoFormularioRedefinir,
  formulario: FormData,
): Promise<EstadoFormularioRedefinir> {
  const token = texto(formulario.get("token"));
  const senha = texto(formulario.get("senha"));
  const confirmacao = texto(formulario.get("confirmacao"));

  if (!token) return { mensagem: "Link de redefinição inválido.", linkInvalido: true };
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return { mensagem: `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
  }
  if (senha !== confirmacao) return { mensagem: "As duas senhas não são iguais." };

  const resultado = await redefinirSenha(token, senha);
  if (!resultado.sucesso) return { mensagem: resultado.erro.message, linkInvalido: true };

  redirect(`${ROTAS.entrar}?motivo=senha-redefinida`);
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
