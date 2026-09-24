"use server";

import { pedirRedefinicaoDeSenha } from "@/nucleo/autenticacao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

const logs = criarRegistradorLogs("redefinicao-senha");

export interface EstadoFormularioEsqueciSenha {
  readonly mensagem?: string;
  readonly enviado?: boolean;
  readonly email?: string;
}

/**
 * Pede o link de redefinicao.
 *
 * Em sucesso a tela mostra SEMPRE o mesmo texto, exista ou nao uma conta com
 * aquele e-mail: do contrario, qualquer pessoa poderia usar esta tela para
 * descobrir quem tem cadastro.
 */
export async function acaoPedirRedefinicao(
  _anterior: EstadoFormularioEsqueciSenha,
  formulario: FormData,
): Promise<EstadoFormularioEsqueciSenha> {
  const email = texto(formulario.get("email")).trim().toLowerCase();
  if (!email) return { mensagem: "Informe o seu e-mail." };

  try {
    const resultado = await pedirRedefinicaoDeSenha(email);
    if (!resultado.sucesso) return { mensagem: resultado.erro.message, email };
  } catch (erro) {
    logs.erro("falha tecnica ao pedir redefinicao", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível enviar o e-mail agora. Tente novamente em instantes.", email };
  }
  return { enviado: true, email };
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
