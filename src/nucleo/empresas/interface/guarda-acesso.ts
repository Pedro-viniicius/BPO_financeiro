import { forbidden, redirect } from "next/navigation";

import type { Permissao } from "@/nucleo/autorizacao/publico";
import { possuiAlguma } from "@/nucleo/autorizacao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { type ContextoAplicacao, resolverContextoAplicacao, rotaAtualDaRequisicao } from "./contexto-aplicacao";
import { decidirDestino, type EstadoAcesso, ROTAS } from "./destino";

/**
 * A fronteira de autorizacao do servidor.
 *
 * Toda tela, server action e rota de API do produto entra por aqui. A cadeia
 * inteira e verificada a cada requisicao, sempre no servidor:
 *
 *     requisicao -> sessao valida -> empresa ativa valida -> vinculo ativo
 *                -> permissao exigida -> caso de uso
 *
 * O menu NAO autoriza nada. `navegacaoVisivel()` apenas esconde o que o
 * usuario nao poderia usar; esconder um item e cortesia, nao controle. Quem
 * digitar a rota na barra de enderecos, chamar a server action direto ou
 * montar um POST a mao passa exatamente por esta mesma verificacao.
 *
 * Por que em cada pagina, e nao no layout: no App Router um layout nao volta a
 * renderizar a cada navegacao (renderizacao parcial) e tambem nao decide se o
 * resto da rota renderiza — os segmentos sao renderizados pelo roteador. Um
 * layout que esconde algo nao impede esse algo de rodar nem de aparecer no
 * RSC Payload. Por isso a verificacao fica junto do dado, como recomenda
 * `node_modules/next/dist/docs/01-app/02-guides/authentication.md`.
 */

const logs = criarRegistradorLogs("autorizacao");

/** Uma permissao, ou uma lista em que BASTA UMA (ex.: tela aberta a varios papeis). */
export type PermissoesExigidas = Permissao | readonly [Permissao, ...Permissao[]];

export type DecisaoAcesso =
  /** Segue para o caso de uso. */
  | { readonly tipo: "permitir" }
  /** Falta sessao ou empresa: mandar para entrar / primeiro acesso. */
  | { readonly tipo: "redirecionar"; readonly destino: string }
  /** Autenticado, com empresa, mas sem a permissao: 403. */
  | { readonly tipo: "proibir"; readonly exigidas: readonly Permissao[] };

/** O que `decidirAcesso` precisa saber. Sem Next.js, sem banco: e testavel puro. */
export interface AcessoParaDecisao {
  readonly estado: EstadoAcesso;
  /** Permissoes efetivas do vinculo ativo. So existe quando o estado e "pronto". */
  readonly permissoes?: ReadonlySet<Permissao>;
}

/**
 * A regra, isolada de framework: dado o estado de acesso e as permissoes
 * efetivas, decide entre seguir, redirecionar ou proibir.
 *
 * Um vinculo revogado nunca chega aqui como "pronto": `resolverContextoAplicacao`
 * so considera vinculos com `ativo = true`, entao a empresa some da lista e o
 * estado vira "sem_empresa" — que cai no ramo de redirecionamento.
 */
export function decidirAcesso(acesso: AcessoParaDecisao, exigidas: readonly Permissao[], rotaAtual: string): DecisaoAcesso {
  const destino = decidirDestino(acesso.estado, rotaAtual);
  if (destino !== null) return { tipo: "redirecionar", destino };

  // `decidirDestino` devolveu null: a rota pode ser exibida neste estado.
  // Fora de "pronto" isso significaria rota publica ou de primeiro acesso, que
  // nao passam por esta guarda. Redirecionar e a resposta segura.
  if (acesso.estado !== "pronto" || !acesso.permissoes) {
    return { tipo: "redirecionar", destino: ROTAS.entrar };
  }

  if (exigidas.length === 0) return { tipo: "permitir" };
  return possuiAlguma({ permissoes: acesso.permissoes }, exigidas) ? { tipo: "permitir" } : { tipo: "proibir", exigidas };
}

/**
 * Exige sessao + empresa ativa + vinculo ativo + permissao, e devolve o
 * contexto pronto para o caso de uso.
 *
 * Use no inicio de toda pagina, server action e rota de API do produto:
 *
 *     const { contexto } = await exigirAcesso("contas_pagar.visualizar");
 *     const pagina = await repositorio.listar(contexto, filtro, paginacao);
 *
 * Sem sessao ou sem empresa: redireciona. Com sessao e empresa mas sem a
 * permissao: `forbidden()` (403 de verdade, renderizado por `app/forbidden.tsx`).
 */
export async function exigirAcesso(permissoes: PermissoesExigidas, rotaPadrao: string = ROTAS.inicio): Promise<ContextoAplicacao> {
  const exigidas = typeof permissoes === "string" ? [permissoes] : permissoes;
  const rotaAtual = await rotaAtualDaRequisicao(rotaPadrao);
  const resolucao = await resolverContextoAplicacao();

  const decisao = decidirAcesso(
    resolucao.estado === "pronto" ? { estado: "pronto", permissoes: resolucao.contexto.permissoes } : { estado: resolucao.estado },
    exigidas,
    rotaAtual,
  );

  if (decisao.tipo === "redirecionar") redirect(decisao.destino);

  if (decisao.tipo === "proibir") {
    // Tentativa de acesso sem permissao e sinal de seguranca: fica no log com
    // quem, onde e o que faltava — nunca so na tela do usuario.
    logs.aviso("acesso negado por falta de permissao", {
      usuarioId: resolucao.estado === "pronto" ? resolucao.sessao.usuarioId : undefined,
      empresaId: resolucao.estado === "pronto" ? resolucao.empresaAtiva.empresaId : undefined,
      rota: rotaAtual,
      exigidas: decisao.exigidas,
    });
    forbidden();
  }

  // `decidirAcesso` so devolve "permitir" quando o estado e "pronto".
  if (resolucao.estado !== "pronto") redirect(ROTAS.entrar);
  return resolucao;
}
