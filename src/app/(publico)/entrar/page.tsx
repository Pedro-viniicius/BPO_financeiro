import type { Metadata } from "next";
import Link from "next/link";

import { LigacoesFormularioSimples, TituloFormularioSimples } from "@/interface/componentes/indice";
import { cadastroAberto } from "@/nucleo/autenticacao/publico";
import { redirecionarSeJaEntrou, retornoSeguro, ROTAS } from "@/nucleo/empresas/publico";

import { FormularioEntrar } from "./formulario-entrar";

export const metadata: Metadata = { title: "Entrar" };

/**
 * A1 — Entrar (docs/ux/mapa-telas.md). Publica; quem ja entrou e levado
 * adiante. `retorno` so e usado quando e um caminho seguro do proprio site.
 */
export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirecionarSeJaEntrou(ROTAS.entrar);
  const parametros = await searchParams;
  const retorno = retornoSeguro(typeof parametros.retorno === "string" ? parametros.retorno : null);
  const sessaoExpirada = parametros.motivo === "sessao-expirada";
  const senhaRedefinida = parametros.motivo === "senha-redefinida";
  const podeCriarConta = await cadastroAberto();

  return (
    <>
      <TituloFormularioSimples titulo="Entrar" descricao="Acesse o financeiro da sua empresa." />
      <FormularioEntrar retorno={retorno} sessaoExpirada={sessaoExpirada} senhaRedefinida={senhaRedefinida} />
      <LigacoesFormularioSimples>
        <Link href={ROTAS.esqueciSenha}>Esqueci minha senha</Link>
      </LigacoesFormularioSimples>
      {podeCriarConta ? (
        <LigacoesFormularioSimples>
          <span>Primeira vez aqui?</span>
          <Link href={ROTAS.criarConta}>Criar a primeira conta</Link>
        </LigacoesFormularioSimples>
      ) : null}
    </>
  );
}
