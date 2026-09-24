"use server";

import { redirect } from "next/navigation";

import { entrarComEmail } from "@/nucleo/autenticacao/publico";
import { destinoPadrao, listarEmpresasAcessiveisDoUsuario, retornoSeguro, ROTAS } from "@/nucleo/empresas/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

const logs = criarRegistradorLogs("entrar");

export interface EstadoFormularioEntrar {
  readonly mensagem?: string;
  readonly email?: string;
}

/**
 * Server action da tela de entrada. Depois de autenticar, decide o destino
 * pelas empresas do usuario (lidas do banco) e por um `retorno` seguro.
 */
export async function acaoEntrar(_anterior: EstadoFormularioEntrar, formulario: FormData): Promise<EstadoFormularioEntrar> {
  const email = texto(formulario.get("email")).trim().toLowerCase();
  const senha = texto(formulario.get("senha"));
  const retorno = retornoSeguro(texto(formulario.get("retorno")));

  if (!email || !senha) {
    return { mensagem: "Informe e-mail e senha.", email };
  }

  let resultado: Awaited<ReturnType<typeof entrarComEmail>>;
  try {
    resultado = await entrarComEmail({ email, senha });
  } catch (erro) {
    logs.erro("falha tecnica ao entrar", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível entrar agora. Tente novamente em instantes.", email };
  }
  if (!resultado.sucesso) {
    return { mensagem: resultado.erro.message, email };
  }

  // Conta com segundo fator: a senha estava certa, mas a sessao so nasce depois
  // do codigo TOTP. O cookie do desafio ja foi gravado pelo Better Auth.
  if (resultado.valor.tipo === "segundo_fator") {
    redirect(retorno ? `${ROTAS.verificacaoDuasEtapas}?retorno=${encodeURIComponent(retorno)}` : ROTAS.verificacaoDuasEtapas);
  }

  const empresas = await listarEmpresasAcessiveisDoUsuario(resultado.valor.usuarioId);
  if (empresas.length === 0) redirect(destinoPadrao("sem_empresa"));
  redirect(retorno ?? ROTAS.inicio);
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
