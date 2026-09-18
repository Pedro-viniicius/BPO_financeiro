"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ehErroDominio } from "@/compartilhado/erros/erro-dominio";
import { obterSessaoAtual } from "@/nucleo/autenticacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { instalarPrimeiraEmpresa } from "../aplicacao/instalar-primeira-empresa";
import { trocarEmpresaAtiva } from "../aplicacao/trocar-empresa-ativa";
import { RepositorioAcessoEmpresasDrizzle } from "../infraestrutura/repositorio-acesso-empresas-drizzle";
import { gravarPreferenciaEmpresaAtiva } from "./cookie-empresa-ativa";
import { decidirDestino, ROTAS } from "./destino";

const logs = criarRegistradorLogs("empresas");

/** Resultado devolvido ao formulario de primeiro acesso (via `useActionState`). */
export interface EstadoFormularioInstalacao {
  readonly mensagem?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
  readonly valores?: { readonly nome?: string; readonly nomeFantasia?: string; readonly cnpj?: string };
}

/**
 * Server action: instala a primeira empresa do usuario autenticado.
 * Em sucesso, redireciona para `/inicio` (a nova empresa vira a ativa).
 */
export async function acaoInstalarPrimeiraEmpresa(
  _anterior: EstadoFormularioInstalacao,
  formulario: FormData,
): Promise<EstadoFormularioInstalacao> {
  const cabecalhos = await headers();
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect(decidirDestino("visitante", ROTAS.primeiroAcesso) ?? ROTAS.entrar);

  const valores = {
    nome: texto(formulario.get("nome")),
    nomeFantasia: texto(formulario.get("nomeFantasia")),
    cnpj: texto(formulario.get("cnpj")),
  };

  const repositorio = new RepositorioAcessoEmpresasDrizzle(obterBancoDados());
  let resultado: Awaited<ReturnType<typeof instalarPrimeiraEmpresa>>;
  try {
    resultado = await instalarPrimeiraEmpresa(
      repositorio,
      {
        usuarioId: sessao.usuarioId,
        origem: "interface",
        requisicaoId: cabecalhos.get("x-request-id") ?? crypto.randomUUID(),
        ...(cabecalhos.get("user-agent") ? { agenteUsuario: cabecalhos.get("user-agent")! } : {}),
      },
      valores,
    );
  } catch (erro) {
    // Falha tecnica (banco fora, etc.): nada foi gravado; nunca expor o erro cru.
    logs.erro("falha ao instalar primeira empresa", { usuarioId: sessao.usuarioId, erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Nao foi possivel criar a empresa agora. Tente novamente em instantes.", valores };
  }

  if (!resultado.sucesso) {
    const erro = resultado.erro;
    if (erro.codigo === "usuario_ja_possui_empresa") redirect(ROTAS.inicio);
    const campos = ehErroDominio(erro) && erro.detalhes && "campos" in erro.detalhes ? (erro.detalhes.campos as Record<string, string[]>) : undefined;
    return { mensagem: erro.message, ...(campos ? { campos } : {}), valores };
  }

  await gravarPreferenciaEmpresaAtiva(resultado.valor.empresaId);
  redirect(ROTAS.inicio);
}

/**
 * Server action: troca a empresa ativa. O id vem de um `<select>` no
 * cabecalho e e validado contra o banco antes de virar cookie.
 */
export async function acaoTrocarEmpresaAtiva(formulario: FormData): Promise<void> {
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect(ROTAS.entrar);

  const empresaPedidaId = texto(formulario.get("empresaId"));
  const resultado = await trocarEmpresaAtiva(new RepositorioAcessoEmpresasDrizzle(obterBancoDados()), sessao.usuarioId, empresaPedidaId);
  if (!resultado.sucesso) {
    logs.aviso("tentativa de ativar empresa sem vinculo", { usuarioId: sessao.usuarioId, empresaPedidaId });
    // Sem cookie novo: a proxima requisicao resolve a empresa ativa pela lista real.
    redirect(ROTAS.inicio);
  }
  await gravarPreferenciaEmpresaAtiva(resultado.valor.empresaId);
  redirect(ROTAS.inicio);
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
