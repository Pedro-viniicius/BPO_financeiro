"use server";

import { redirect } from "next/navigation";

import { sairDaSessao } from "@/nucleo/autenticacao/publico";
import { apagarPreferenciaEmpresaAtiva, ROTAS } from "@/nucleo/empresas/publico";

/** Sair: revoga a sessao, esquece a empresa ativa e volta para a entrada. */
export async function acaoSair(): Promise<void> {
  await sairDaSessao();
  await apagarPreferenciaEmpresaAtiva();
  redirect(ROTAS.entrar);
}
