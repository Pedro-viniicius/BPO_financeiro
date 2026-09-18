import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import * as esquemaAutenticacao from "./esquema-better-auth";

/**
 * Instancia do Better Auth (biblioteca de autenticacao). Ver ADR-006.
 *
 * Responde "quem e o usuario?": cadastro com e-mail e senha, sessoes,
 * redefinicao de senha, verificacao em duas etapas (TOTP) e "Continuar com
 * Google" quando configurado. NAO decide o que o usuario pode fazer — isso e
 * `nucleo/autorizacao`.
 *
 * Termos da biblioteca mantidos em ingles de proposito (sao a API dela):
 * signIn, signUp, getSession, twoFactor, socialProviders.
 */
const logs = criarRegistradorLogs("autenticacao");

function criarAutenticacao() {
  const variaveis = obterVariaveisAmbiente();
  const producao = variaveis.AMBIENTE === "producao";

  const provedoresSociais =
    variaveis.GOOGLE_CLIENTE_ID && variaveis.GOOGLE_CLIENTE_SEGREDO
      ? { google: { clientId: variaveis.GOOGLE_CLIENTE_ID, clientSecret: variaveis.GOOGLE_CLIENTE_SEGREDO } }
      : {};

  return betterAuth({
    appName: "Financeiro",
    baseURL: variaveis.APLICACAO_URL,
    basePath: "/api/autenticacao",
    secret: variaveis.APLICACAO_SEGREDO,
    database: drizzleAdapter(obterBancoDados(), { provider: "pg", schema: esquemaAutenticacao }),
    trustedOrigins: [variaveis.APLICACAO_URL],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // O primeiro usuario e criado pelo instalador; os demais entram por convite (Gate 5).
      disableSignUp: producao,
      requireEmailVerification: producao,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, url }) => {
        // O envio real usa `integracoes/email` (Gate 5). Aqui apenas registramos sem expor o token.
        logs.info("solicitacao de redefinicao de senha", { usuarioId: user.id, urlPresente: Boolean(url) });
      },
    },

    session: {
      // Sessao de 7 dias, renovada a cada 1 dia de uso.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Sem cache de sessao em cookie: cada requisicao consulta o banco. Custo baixo,
      // e a revogacao de sessao (sair, troca de senha, remocao de acesso) vale na hora.
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
      },
    },

    advanced: {
      useSecureCookies: producao,
      cookiePrefix: "financeiro",
      database: { generateId: "uuid" },
    },

    socialProviders: provedoresSociais,

    plugins: [
      twoFactor({ issuer: "Financeiro" }),
      // Deve ser o ultimo plugin: permite gravar cookies a partir de server actions do Next.js.
      nextCookies(),
    ],
  });
}

const globalComAutenticacao = globalThis as typeof globalThis & { __autenticacaoFinanceiro?: ReturnType<typeof criarAutenticacao> };

/** Instancia unica por processo. Criada na primeira chamada para nao exigir variaveis no build. */
export function obterAutenticacao() {
  if (!globalComAutenticacao.__autenticacaoFinanceiro) {
    globalComAutenticacao.__autenticacaoFinanceiro = criarAutenticacao();
  }
  return globalComAutenticacao.__autenticacaoFinanceiro;
}

export type Autenticacao = ReturnType<typeof criarAutenticacao>;
