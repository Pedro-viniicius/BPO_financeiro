import { redirect } from "next/navigation";

import { destinoPadrao, estadoAcessoAtual } from "@/nucleo/empresas/publico";

/**
 * `/` nao tem conteudo: leva cada estado ao seu lugar
 * (visitante -> /entrar; sem empresa -> /primeiro-acesso; pronto -> /inicio).
 */
export default async function PaginaRaiz() {
  redirect(destinoPadrao(await estadoAcessoAtual()));
}
