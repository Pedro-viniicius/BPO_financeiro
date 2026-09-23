import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import { montarEnviadorEmail } from "@/composicao/email";
import { existeConvitePendentePara } from "./convite-pendente";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { montarMensagemRedefinicaoSenha } from "../aplicacao/mensagem-redefinicao-senha";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "../dominio/regras-senha";
import { contarUsuarios } from "./contar-usuarios";
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

/** Quanto tempo o link de redefinicao vale. O e-mail diz este mesmo numero. */
const VALIDADE_REDEFINICAO_EM_MINUTOS = 30;

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
      minPasswordLength: TAMANHO_MINIMO_SENHA,
      maxPasswordLength: TAMANHO_MAXIMO_SENHA,
      // Cadastro publico: sempre para o PRIMEIRO usuario (instalacao vazia);
      // depois, em producao, so por convite. Regra em `databaseHooks.user.create.before`.
      disableSignUp: false,
      // Verificacao de e-mail obrigatoria so faz sentido quando existe envio de
      // e-mail (integracoes/email, gate posterior). Exigir sem enviar trancaria
      // o primeiro usuario de uma instalacao de producao para fora.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: VALIDADE_REDEFINICAO_EM_MINUTOS * 60,
      sendResetPassword: async ({ user, token }) => {
        // O link aponta para a NOSSA tela (/redefinir-senha), nao para a rota
        // padrao da biblioteca: quem troca a senha ve a casca do produto.
        const mensagem = montarMensagemRedefinicaoSenha({
          para: user.email,
          nome: user.name,
          token,
          aplicacaoUrl: variaveis.APLICACAO_URL,
          validadeEmMinutos: VALIDADE_REDEFINICAO_EM_MINUTOS,
        });
        try {
          await montarEnviadorEmail().enviar(mensagem);
          logs.info("e-mail de redefinicao de senha entregue ao provedor", { usuarioId: user.id });
        } catch (erro) {
          // Nunca deixar passar em silencio: sem isto, a tela diria "enviamos"
          // e ninguem saberia que nada saiu.
          logs.erro("falha ao enviar e-mail de redefinicao de senha", {
            usuarioId: user.id,
            erro: erro instanceof Error ? erro.message : String(erro),
          });
          throw erro;
        }
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

    databaseHooks: {
      user: {
        create: {
          before: async (usuario) => {
            if (await cadastroAberto()) return;
            /*
             * A porta que sobra e o convite. Sem esta checagem, aceitar um
             * convite em producao seria recusado pela propria regra que existe
             * para proteger a instalacao — e a entrada por convite, prometida
             * na mensagem de erro, nunca funcionaria.
             */
            if (typeof usuario?.email === "string" && (await existeConvitePendentePara(usuario.email))) return;
            throw new APIError("FORBIDDEN", { code: "CADASTRO_FECHADO", message: "Cadastro fechado: entrada por convite." });
          },
        },
      },
    },

    plugins: [
      twoFactor({ issuer: "Financeiro" }),
      // Deve ser o ultimo plugin: permite gravar cookies a partir de server actions do Next.js.
      nextCookies(),
    ],
  });
}

/**
 * O cadastro publico esta aberto quando a instalacao ainda nao tem usuario
 * (alguem precisa ser o primeiro) ou fora de producao (testes com varios
 * usuarios). Em producao com usuarios, a entrada e por convite.
 */
export async function cadastroAberto(): Promise<boolean> {
  if (obterVariaveisAmbiente().AMBIENTE !== "producao") return true;
  return (await contarUsuarios()) === 0;
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
