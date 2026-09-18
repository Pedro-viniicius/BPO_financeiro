import type { ReactNode } from "react";

import { CascaAplicacao, navegacaoVisivel } from "@/interface/casca/casca-aplicacao";

import { obterContextoDaCasca } from "./contexto-casca";

/**
 * Grupo de rotas dentro da casca: toda tela do produto, exceto autenticacao
 * e primeiro acesso (docs/ux/navegacao.md, secao 5).
 */
export default async function LayoutAplicacao({ children }: { children: ReactNode }) {
  const contexto = await obterContextoDaCasca();

  return (
    <CascaAplicacao
      cabecalho={{
        nomeDaEmpresa: contexto.nomeDaEmpresa,
        nomeDoUsuario: contexto.nomeDoUsuario,
        papelDoUsuario: contexto.papelDoUsuario,
      }}
      grupos={navegacaoVisivel(contexto.permissoes)}
    >
      {children}
    </CascaAplicacao>
  );
}
