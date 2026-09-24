import { cadastroAberto, obterAutenticacao } from "../infraestrutura/better-auth";
import { ehAtivacaoDeSegundoFator, MOTIVO_ATIVACAO_INDISPONIVEL } from "./portao-segundo-fator";

/**
 * A porta unica das requisicoes HTTP de autenticacao.
 *
 * Tudo o que chega a `/api/autenticacao/*` — pela rota publica OU pela
 * requisicao reconstruida nas acoes de entrar e criar conta — passa por
 * aqui antes do handler do Better Auth. Dois portoes, nesta ordem:
 *
 * 1. ATIVACAO do segundo fator: fechada enquanto nao existe a tela
 *    (`portao-segundo-fator.ts`).
 * 2. CADASTRO PUBLICO fechado: `/sign-up/email` responde 403 ANTES de a
 *    biblioteca consultar o banco. A biblioteca responderia 422 para e-mail
 *    ja cadastrado e so depois 403 para e-mail novo — e essa diferenca diz a
 *    qualquer pessoa quem tem conta aqui. A resposta precisa ser a mesma para
 *    os dois casos, e a unica forma de garantir isso e nao deixar a pergunta
 *    chegar ao banco. A criacao de conta por convite nao passa por HTTP
 *    (`criarUsuarioComSenha` chama a API da biblioteca direto), entao este
 *    portao nao a alcanca.
 *
 * As dependencias sao injetaveis para que a regra seja testavel sem banco.
 */
export interface DependenciasTratamento {
  readonly cadastroAberto: () => Promise<boolean>;
  readonly handler: (requisicao: Request) => Promise<Response>;
}

/** Caminho da rota de cadastro por e-mail, relativo a `/api/autenticacao`. */
const CAMINHO_CADASTRO = "/sign-up/email";

export function ehCadastroPorEmail(caminho: string): boolean {
  const semQuery = caminho.split(/[?#]/)[0] ?? caminho;
  const normalizado = semQuery.length > 1 && semQuery.endsWith("/") ? semQuery.slice(0, -1) : semQuery;
  return normalizado.replace(/^.*\/api\/autenticacao/, "").toLowerCase() === CAMINHO_CADASTRO;
}

/** A MESMA resposta para qualquer cadastro com a porta fechada: nao confirma se o e-mail tem conta. */
export function respostaCadastroFechado(): Response {
  return Response.json({ code: "CADASTRO_FECHADO", message: "Cadastro fechado: entrada por convite." }, { status: 403 });
}

export async function tratarRequisicaoAutenticacao(
  requisicao: Request,
  dependencias: DependenciasTratamento = {
    cadastroAberto,
    handler: (pedido) => obterAutenticacao().handler(pedido),
  },
): Promise<Response> {
  const caminho = new URL(requisicao.url).pathname;

  if (ehAtivacaoDeSegundoFator(caminho)) {
    return Response.json({ code: "SEGUNDO_FATOR_ATIVACAO_INDISPONIVEL", message: MOTIVO_ATIVACAO_INDISPONIVEL }, { status: 403 });
  }

  if (requisicao.method === "POST" && ehCadastroPorEmail(caminho) && !(await dependencias.cadastroAberto())) {
    return respostaCadastroFechado();
  }

  return dependencias.handler(requisicao);
}
