import type { Metadata } from "next";

import { TituloFormularioSimples } from "@/interface/componentes/indice";
import { redirecionarSeJaEntrou, retornoSeguro, ROTAS } from "@/nucleo/empresas/publico";

import { FormularioSegundoFator } from "./formulario-segundo-fator";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

/**
 * Segundo passo da entrada, para contas com TOTP ligado.
 *
 * Quando se chega aqui a senha ja foi conferida, mas a sessao ainda NAO
 * existe: ha apenas o cookie do desafio, gravado pelo Better Auth. Por isso a
 * tela vive em `(publico)` — para a tabela de destinos quem tem desafio
 * pendente ainda e visitante. Quem ja tem sessao nao tem o que verificar e e
 * levado adiante por `redirecionarSeJaEntrou`.
 */
export default async function PaginaVerificacaoDuasEtapas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirecionarSeJaEntrou(ROTAS.verificacaoDuasEtapas);
  const parametros = await searchParams;
  const retorno = retornoSeguro(typeof parametros.retorno === "string" ? parametros.retorno : null);

  return (
    <>
      <TituloFormularioSimples
        titulo="Verificação em duas etapas"
        descricao="Sua conta pede um código do aplicativo de autenticação para concluir a entrada."
      />
      <FormularioSegundoFator retorno={retorno} rotaEntrar={ROTAS.entrar} />
    </>
  );
}
