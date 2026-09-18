import { headers } from "next/headers";

import type { IdUsuario } from "@/compartilhado/tipos/identificadores";

import type { SessaoAtual } from "../aplicacao/sessao-atual";
import { obterAutenticacao } from "../infraestrutura/better-auth";

/**
 * Le a sessao da requisicao atual (cookies) e a traduz para `SessaoAtual`.
 * Devolve `null` quando nao ha usuario autenticado.
 * So funciona no servidor (rotas, server components, server actions).
 */
export async function obterSessaoAtual(): Promise<SessaoAtual | null> {
  // `headers()` primeiro: e o que marca a rota como dinamica. Se a instancia
  // do Better Auth fosse criada antes, o `next build` tentaria ler o .env ao
  // pre-renderizar a pagina e falharia.
  const cabecalhos = await headers();
  const resultado = await obterAutenticacao().api.getSession({ headers: cabecalhos });
  if (!resultado) return null;
  return {
    usuarioId: resultado.user.id as IdUsuario,
    nome: resultado.user.name,
    email: resultado.user.email,
    emailVerificado: resultado.user.emailVerified,
    duasEtapasAtivas: Boolean(resultado.user.twoFactorEnabled),
    sessaoId: resultado.session.id,
    expiraEm: resultado.session.expiresAt,
  };
}
