import type { ReactNode } from "react";

import { CascaAplicacao } from "@/interface/casca/casca-aplicacao";
import { navegacaoVisivel } from "@/interface/casca/mapa-navegacao";
import { NOMES_PAPEIS } from "@/nucleo/autorizacao/publico";
import { acaoTrocarEmpresaAtiva, exigirContextoAplicacao, rotaAtualDaRequisicao, ROTAS } from "@/nucleo/empresas/publico";

import { acaoSair } from "./acoes-sessao";

/**
 * Grupo de rotas dentro da casca: toda tela do produto, exceto entrada e
 * primeiro acesso. Exige sessao E empresa ativa, resolvidas no servidor a
 * cada requisicao (docs/arquitetura/autenticacao-e-empresa-ativa.md).
 */
export default async function LayoutAplicacao({ children }: { children: ReactNode }) {
  const rotaAtual = await rotaAtualDaRequisicao(ROTAS.inicio);
  const { sessao, empresaAtiva, empresasAcessiveis, contexto } = await exigirContextoAplicacao(rotaAtual);

  return (
    <CascaAplicacao
      cabecalho={{
        nomeDaEmpresa: empresaAtiva.nomeFantasia ?? empresaAtiva.nome,
        nomeDoUsuario: sessao.nome,
        papelDoUsuario: NOMES_PAPEIS[contexto.papel],
        empresas: empresasAcessiveis.map((empresa) => ({ id: empresa.empresaId, nome: empresa.nomeFantasia ?? empresa.nome })),
        empresaAtivaId: empresaAtiva.empresaId,
        aoTrocarEmpresa: acaoTrocarEmpresaAtiva,
        aoSair: acaoSair,
      }}
      grupos={navegacaoVisivel(contexto.permissoes)}
    >
      {children}
    </CascaAplicacao>
  );
}
