import { toNextJsHandler } from "better-auth/next-js";

import { obterAutenticacao } from "@/nucleo/autenticacao/publico";

/**
 * Rotas de autenticacao (entrar, sair, redefinir senha, duas etapas, Google).
 * Todas ficam sob /api/autenticacao/* e sao tratadas pelo Better Auth.
 * A instancia e criada na primeira requisicao (nao no build), pois depende de variaveis de ambiente.
 */
const manipulador = toNextJsHandler((requisicao: Request) => obterAutenticacao().handler(requisicao));

export const GET = manipulador.GET;
export const POST = manipulador.POST;
