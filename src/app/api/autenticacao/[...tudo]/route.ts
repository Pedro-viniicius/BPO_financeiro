import { toNextJsHandler } from "better-auth/next-js";

import { tratarRequisicaoAutenticacao } from "@/nucleo/autenticacao/publico";

/**
 * Rotas de autenticacao (entrar, sair, redefinir senha, duas etapas, Google).
 * Todas ficam sob /api/autenticacao/* e sao tratadas pelo Better Auth.
 * A instancia e criada na primeira requisicao (nao no build), pois depende de variaveis de ambiente.
 *
 * Os portoes que ficam ANTES da biblioteca — ativacao do segundo fator
 * (fechada enquanto nao ha tela) e cadastro publico fechado (resposta unica,
 * sem revelar quem tem conta) — vivem em `tratarRequisicaoAutenticacao`,
 * que tambem serve as acoes de entrar e criar conta. Assim a regra e uma so,
 * seja o pedido vindo do navegador direto ou reconstruido pela acao.
 */
const manipulador = toNextJsHandler(tratarRequisicaoAutenticacao);

export const GET = manipulador.GET;
export const POST = manipulador.POST;
