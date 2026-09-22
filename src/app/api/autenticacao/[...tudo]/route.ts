import { toNextJsHandler } from "better-auth/next-js";

import { ehAtivacaoDeSegundoFator, MOTIVO_ATIVACAO_INDISPONIVEL, obterAutenticacao } from "@/nucleo/autenticacao/publico";

/**
 * Rotas de autenticacao (entrar, sair, redefinir senha, duas etapas, Google).
 * Todas ficam sob /api/autenticacao/* e sao tratadas pelo Better Auth.
 * A instancia e criada na primeira requisicao (nao no build), pois depende de variaveis de ambiente.
 *
 * A unica coisa que nao e repassada e a ATIVACAO do segundo fator, fechada
 * enquanto a tela correspondente nao existe — ver `portao-segundo-fator.ts`.
 * A verificacao (`verify-totp`, `verify-backup-code`) e o desligamento
 * (`disable`) passam normalmente.
 */
async function tratar(requisicao: Request): Promise<Response> {
  if (ehAtivacaoDeSegundoFator(new URL(requisicao.url).pathname)) {
    return Response.json(
      { code: "SEGUNDO_FATOR_ATIVACAO_INDISPONIVEL", message: MOTIVO_ATIVACAO_INDISPONIVEL },
      { status: 403 },
    );
  }
  return obterAutenticacao().handler(requisicao);
}

const manipulador = toNextJsHandler(tratar);

export const GET = manipulador.GET;
export const POST = manipulador.POST;
