"use server";

import { redirect } from "next/navigation";

import { verificarSegundoFator } from "@/nucleo/autenticacao/publico";
import { destinoPadrao, estadoAcessoAtual, retornoSeguro, ROTAS } from "@/nucleo/empresas/publico";

export interface EstadoFormularioSegundoFator {
  readonly mensagem?: string;
  /** Quando o desafio expirou, a tela oferece voltar para a entrada em vez de tentar de novo. */
  readonly expirado?: boolean;
}

/**
 * Server action da verificacao em duas etapas. Confirma o codigo TOTP do
 * desafio pendente e, em sucesso, decide o destino do mesmo jeito que a
 * entrada por senha: empresas do usuario lidas do banco + `retorno` seguro.
 */
export async function acaoVerificarSegundoFator(
  _anterior: EstadoFormularioSegundoFator,
  formulario: FormData,
): Promise<EstadoFormularioSegundoFator> {
  const codigo = texto(formulario.get("codigo")).trim();
  const retorno = retornoSeguro(texto(formulario.get("retorno")));

  if (!codigo) return { mensagem: "Informe o código do aplicativo de autenticação." };

  const resultado = await verificarSegundoFator(codigo);
  if (!resultado.sucesso) {
    return { mensagem: resultado.erro.message, expirado: resultado.erro.codigo === "desafio_segundo_fator_expirado" };
  }

  // A sessao existe a partir daqui: o estado de acesso ja responde pelo banco.
  redirect(retorno ?? destinoPadrao(await estadoAcessoAtual()));
}

/** Sair do desafio sem concluir: volta para a entrada. O desafio pendente e abandonado. */
export async function acaoCancelarSegundoFator(): Promise<void> {
  redirect(ROTAS.entrar);
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
