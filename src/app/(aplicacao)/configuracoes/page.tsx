import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina, TituloSecao } from "@/interface/componentes/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { RepositorioDadosDaEmpresaDrizzle } from "@/nucleo/empresas/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./configuracoes.module.css";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Capa das Configuracoes.
 *
 * Cada cartao mostra o ESTADO do assunto, nao so o nome: "falta a data de
 * corte" e mais util do que "Empresa". Quem abre esta tela esta quase sempre
 * atras de uma pendencia de implantacao.
 */
export default async function PaginaConfiguracoes() {
  const { escopo, nomeEmpresa } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes");

  const [empresa, plano] = await Promise.all([
    new RepositorioDadosDaEmpresaDrizzle(obterBancoDados()).obter(escopo),
    repositorios.planoContas().montar(escopo),
  ]);

  const pendencias = [
    empresa?.dataInicioUso ? null : "a data de corte da empresa",
    empresa?.cnpj ? null : "o CNPJ",
    plano.totalContas === 0 ? "o plano de contas" : null,
    plano.linhasSemCategoria.length > 0 ? `categorias para ${plano.linhasSemCategoria.length} linha(s) do resultado` : null,
  ].filter((p): p is string => p !== null);

  return (
    <>
      <CabecalhoPagina titulo="Configurações" descricao={`Empresa, usuários e implantação · ${nomeEmpresa}`} />

      {pendencias.length > 0 ? (
        <p className={estilos.pendencias}>
          <strong>Falta preencher:</strong> {pendencias.join(", ")}.
        </p>
      ) : (
        <p className={estilos.tudoCerto}>
          <strong>Configuração completa.</strong> Empresa identificada, data de corte definida e plano de contas
          cobrindo todas as linhas do resultado.
        </p>
      )}

      <TituloSecao titulo="Assuntos" />
      <ul className={estilos.cartoes}>
        <li>
          <Link href="/configuracoes/empresa">
            <strong>Dados da empresa</strong>
            <span>
              {empresa?.razaoSocial ?? "—"}
              {empresa?.dataInicioUso ? ` · usa o sistema desde ${empresa.dataInicioUso.split("-").reverse().join("/")}` : " · sem data de corte"}
            </span>
          </Link>
        </li>
        <li>
          <Link href="/configuracoes/implantacao">
            <strong>Implantação</strong>
            <span>O passo a passo para começar: empresa, plano, bancos, cadastros e contas em aberto</span>
          </Link>
        </li>
        <li>
          <Link href="/configuracoes/usuarios">
            <strong>Usuários e acessos</strong>
            <span>Quem entra no sistema, com que papel, e convites em aberto</span>
          </Link>
        </li>
        <li>
          <Link href="/cadastros/plano-de-contas">
            <strong>Plano de contas</strong>
            <span>
              {plano.totalContas} contas e {plano.totalCategorias} categorias
              {plano.linhasSemCategoria.length > 0 ? ` · ${plano.linhasSemCategoria.length} linha(s) do resultado sem categoria` : " · todas as linhas cobertas"}
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
