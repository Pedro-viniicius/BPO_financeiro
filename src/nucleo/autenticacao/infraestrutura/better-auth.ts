import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import { montarEnviadorEmail } from "@/composicao/email";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { entregarRedefinicaoDeSenha } from "../aplicacao/entregar-redefinicao-senha";
import { montarMensagemRedefinicaoSenha } from "../aplicacao/mensagem-redefinicao-senha";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "../dominio/regras-senha";
import { contarUsuarios } from "./contar-usuarios";
import { criacaoAutorizada, podeCriarUsuario } from "./criacao-autorizada";
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
        /*
         * A falha do provedor vai para o log de erro e NAO sobe: a biblioteca
         * so chama este envio quando o e-mail existe, e uma resposta diferente
         * aqui diria a qualquer pessoa quais e-mails tem conta. Quem opera ve
         * a falha no log; quem digitou o e-mail ve a mesma tela de sempre.
         */
        await entregarRedefinicaoDeSenha(
          { enviar: async (pronta) => montarEnviadorEmail().enviar(pronta), logs },
          mensagem,
          user.id,
        );
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
          /*
           * Vale para TODA criacao de usuario da biblioteca: e-mail e senha e
           * tambem "Continuar com Google" (`createOAuthUser` passa pelos
           * mesmos ganchos).
           *
           * A porta que sobra com o cadastro fechado e o convite — e o convite
           * e validado pelo TOKEN em `aceitarConvite`, que marca a criacao
           * como autorizada (`criacaoAutorizada`) antes de pedir a conta.
           * Nao se pergunta mais "existe convite para este e-mail?": essa
           * pergunta a rota publica respondia a qualquer um, e quem soubesse
           * um e-mail convidado criava a conta antes do convidado.
           */
          before: async () => {
            if (podeCriarUsuario(criacaoAutorizada.getStore(), await cadastroAberto())) return;
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
