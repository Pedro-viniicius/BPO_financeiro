import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { IdEmpresa } from "@/compartilhado/tipos/identificadores";
import { obterSessaoAtual, type SessaoAtual } from "@/nucleo/autenticacao/publico";
import { type ContextoUsuario, resolverPermissoesEfetivas } from "@/nucleo/autorizacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";

import { type EmpresaAcessivel, resolverEmpresaAtiva } from "../dominio/acesso-empresas";
import { RepositorioAcessoEmpresasDrizzle } from "../infraestrutura/repositorio-acesso-empresas-drizzle";
import { lerPreferenciaEmpresaAtiva } from "./cookie-empresa-ativa";
import { decidirDestino, type EstadoAcesso } from "./destino";

/**
 * O contexto completo de uma requisicao autenticada com empresa ativa.
 *
 * `contexto` e o `ContextoUsuario` do Gate 2 — o unico objeto que casos de
 * uso recebem. Os demais campos servem a casca (nome da empresa, lista para
 * trocar).
 */
export interface ContextoAplicacao {
  readonly sessao: SessaoAtual;
  readonly empresaAtiva: EmpresaAcessivel;
  readonly empresasAcessiveis: readonly EmpresaAcessivel[];
  readonly contexto: ContextoUsuario;
}

export type ResolucaoContexto =
  | { readonly estado: "visitante" }
  | { readonly estado: "sem_empresa"; readonly sessao: SessaoAtual }
  | ({ readonly estado: "pronto" } & ContextoAplicacao);

/**
 * Resolve, no servidor e a cada requisicao, quem esta agindo e em qual empresa.
 *
 * Ordem importa: `headers()` primeiro marca a rota como dinamica (nada disto
 * roda no `next build`); so depois tocamos no Better Auth e no banco.
 */
export async function resolverContextoAplicacao(): Promise<ResolucaoContexto> {
  const cabecalhos = await headers();
  const sessao = await obterSessaoAtual();
  if (!sessao) return { estado: "visitante" };

  const repositorio = new RepositorioAcessoEmpresasDrizzle(obterBancoDados());
  const empresasAcessiveis = await repositorio.listarEmpresasAcessiveis(sessao.usuarioId);
  const empresaAtiva = resolverEmpresaAtiva(empresasAcessiveis, await lerPreferenciaEmpresaAtiva());
  if (!empresaAtiva) return { estado: "sem_empresa", sessao };

  const contexto: ContextoUsuario = {
    usuarioId: sessao.usuarioId,
    nomeUsuario: sessao.nome,
    organizacaoId: empresaAtiva.organizacaoId,
    empresaId: empresaAtiva.empresaId,
    papel: empresaAtiva.papel,
    permissoes: resolverPermissoesEfetivas(empresaAtiva.papel, empresaAtiva.permissoesExtras, empresaAtiva.permissoesRemovidas),
    requisicao: metadadosRequisicao(cabecalhos),
  };
  return { estado: "pronto", sessao, empresaAtiva, empresasAcessiveis, contexto };
}

/** Cabecalho interno preenchido por `src/proxy.ts` com a rota pedida. */
const CABECALHO_ROTA_ATUAL = "x-rota-atual";

/** Rota pedida nesta requisicao (com query), ou `padrao` quando o proxy nao rodou. */
export async function rotaAtualDaRequisicao(padrao: string): Promise<string> {
  const cabecalhos = await headers();
  return cabecalhos.get(CABECALHO_ROTA_ATUAL) ?? padrao;
}

/**
 * Para layouts e paginas dentro da casca: devolve o contexto pronto ou
 * redireciona conforme a tabela de destinos. `rotaAtual` e usada para o
 * `retorno` apos entrar.
 */
export async function exigirContextoAplicacao(rotaAtual: string): Promise<ContextoAplicacao> {
  const resolucao = await resolverContextoAplicacao();
  const destino = decidirDestino(resolucao.estado, rotaAtual);
  if (destino) redirect(destino);
  if (resolucao.estado !== "pronto") redirect(decidirDestino(resolucao.estado, "/") ?? "/");
  return resolucao;
}

/** Para `/primeiro-acesso`: exige sessao e exige que NAO haja empresa. */
export async function exigirSessaoSemEmpresa(rotaAtual: string): Promise<SessaoAtual> {
  const resolucao = await resolverContextoAplicacao();
  const destino = decidirDestino(resolucao.estado, rotaAtual);
  if (destino) redirect(destino);
  if (resolucao.estado !== "sem_empresa") redirect(decidirDestino(resolucao.estado, "/") ?? "/");
  return resolucao.sessao;
}

/** Para rotas publicas (`/entrar`, `/criar-conta`): quem ja entrou e levado adiante. */
export async function redirecionarSeJaEntrou(rotaAtual: string): Promise<void> {
  const resolucao = await resolverContextoAplicacao();
  const destino = decidirDestino(resolucao.estado, rotaAtual);
  if (destino) redirect(destino);
}

/** Estado de acesso atual, para a rota `/` e para o pos-login. */
export async function estadoAcessoAtual(): Promise<EstadoAcesso> {
  return (await resolverContextoAplicacao()).estado;
}

/** Lista de empresas acessiveis para validar uma troca (nunca a lista do cliente). */
export async function listarEmpresasAcessiveisDoUsuario(usuarioId: SessaoAtual["usuarioId"]): Promise<readonly EmpresaAcessivel[]> {
  return new RepositorioAcessoEmpresasDrizzle(obterBancoDados()).listarEmpresasAcessiveis(usuarioId);
}

export type { IdEmpresa };

function metadadosRequisicao(cabecalhos: Headers): ContextoUsuario["requisicao"] {
  const ip = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() || cabecalhos.get("x-real-ip") || undefined;
  const agenteUsuario = cabecalhos.get("user-agent") ?? undefined;
  return {
    id: cabecalhos.get("x-request-id") ?? crypto.randomUUID(),
    ...(ip ? { ip } : {}),
    ...(agenteUsuario ? { agenteUsuario } : {}),
  };
}
