import type { Metadata } from "next";
import Link from "next/link";

import { NOMES_SITUACAO_PAGAR, NOMES_SITUACAO_RECEBER } from "@/compartilhado/financeiro/indice";
import { CabecalhoPagina, EstadoVazio, SeloSituacao, TituloSecao } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./busca.module.css";

export const metadata: Metadata = { title: "Busca" };

/** Quantos resultados por area. Mais do que isso, a lista da propria area continua a busca. */
const POR_AREA = 8;
/** Uma letra so casaria com quase tudo; duas ja estreitam. */
const MINIMO_CARACTERES = 2;

/**
 * Busca global — o campo do cabecalho.
 *
 * Reaproveita as buscas que as listas ja fazem, com as MESMAS regras e o
 * mesmo escopo de empresa: contas a pagar e a receber por descricao, codigo
 * (CP-2026-000123) e nome da pessoa; cadastros por nome e CPF/CNPJ. Cada
 * area so aparece para quem tem a permissao de ve-la — a busca nunca e porta
 * dos fundos para o que a tela da area nao mostraria.
 *
 * Mostra poucos resultados por area, e o link "ver todos" abre a lista da
 * area ja filtrada: e la que estao a paginacao e os demais filtros.
 */
export default async function PaginaBusca({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro(
    ["contas_pagar.visualizar", "contas_receber.visualizar", "cadastros.visualizar"],
    "/busca",
  );
  const bruto = (await searchParams).q;
  const termo = (typeof bruto === "string" ? bruto : "").trim().slice(0, 100);

  const vePagar = permissoes.has("contas_pagar.visualizar");
  const veReceber = permissoes.has("contas_receber.visualizar");
  const veCadastros = permissoes.has("cadastros.visualizar");

  const cabecalho = (
    <CabecalhoPagina
      titulo="Busca"
      descricao={termo ? `Resultados para “${termo}”` : "Contas, códigos, fornecedores, clientes e CPF/CNPJ"}
    />
  );

  if (termo.length < MINIMO_CARACTERES) {
    return (
      <>
        {cabecalho}
        <EstadoVazio
          titulo="Digite o que você procura"
          explicacao={`Use o campo de busca no topo da tela, com pelo menos ${MINIMO_CARACTERES} letras: a descrição ou o código de uma conta (CP-2026-000123), o nome de um fornecedor ou cliente, ou um CPF/CNPJ.`}
        />
      </>
    );
  }

  const pagina = { pagina: 1, tamanho: POR_AREA };
  const [pagar, receber, pessoas] = await Promise.all([
    vePagar ? repositorios.contasPagar().listar(escopo, { busca: termo }, pagina, hoje) : null,
    veReceber ? repositorios.contasReceber().listar(escopo, { busca: termo }, pagina, hoje) : null,
    veCadastros ? repositorios.cadastros().listarPessoas(escopo, termo) : null,
  ]);

  const total = (pagar?.total ?? 0) + (receber?.total ?? 0) + (pessoas?.length ?? 0);
  const buscaNaUrl = encodeURIComponent(termo);

  if (total === 0) {
    return (
      <>
        {cabecalho}
        <EstadoVazio
          motivo="filtrado"
          titulo={`Nada encontrado para “${termo}”`}
          explicacao="Confira a grafia, tente só uma parte do nome ou do código, ou busque pelo CPF/CNPJ sem pontos."
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}

      {pagar && pagar.total > 0 ? (
        <section className={estilos.area} aria-labelledby="busca-pagar">
          <TituloSecao
            titulo="Contas a pagar"
            explicacao={`${pagar.total} ${pagar.total === 1 ? "encontrada" : "encontradas"}`}
            {...(pagar.total > pagar.itens.length
              ? { acao: <Link href={`/contas-pagar?busca=${buscaNaUrl}`}>Ver todas as {pagar.total} em Contas a pagar</Link> }
              : {})}
          />
          <ul className={estilos.lista} id="busca-pagar" aria-label="Contas a pagar encontradas">
            {pagar.itens.map((conta) => (
              <li key={conta.parcelaId} className={estilos.item}>
                <Link href={`/contas-pagar/${conta.parcelaId}`} className={estilos.titulo}>
                  {conta.descricao}
                </Link>
                <span className={estilos.detalhe}>
                  {conta.codigo} · {conta.fornecedorNome} · vence {formatarDataBrasileira(conta.dataVencimento)}
                </span>
                <span className={estilos.valor}>{formatarDinheiro(conta.saldo)}</span>
                <SeloSituacao tom={tomDaSituacao(conta.situacao)} rotulo={NOMES_SITUACAO_PAGAR[conta.situacao]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {receber && receber.total > 0 ? (
        <section className={estilos.area} aria-labelledby="busca-receber">
          <TituloSecao
            titulo="Contas a receber"
            explicacao={`${receber.total} ${receber.total === 1 ? "encontrada" : "encontradas"}`}
            {...(receber.total > receber.itens.length
              ? { acao: <Link href={`/contas-receber?busca=${buscaNaUrl}`}>Ver todas as {receber.total} em Contas a receber</Link> }
              : {})}
          />
          <ul className={estilos.lista} id="busca-receber" aria-label="Contas a receber encontradas">
            {receber.itens.map((conta) => (
              <li key={conta.parcelaId} className={estilos.item}>
                <Link href={`/contas-receber/${conta.parcelaId}`} className={estilos.titulo}>
                  {conta.descricao}
                </Link>
                <span className={estilos.detalhe}>
                  {conta.codigo} · {conta.clienteNome} · vence {formatarDataBrasileira(conta.dataVencimento)}
                </span>
                <span className={estilos.valor}>{formatarDinheiro(conta.saldo)}</span>
                <SeloSituacao tom={tomDaSituacao(conta.situacao)} rotulo={NOMES_SITUACAO_RECEBER[conta.situacao]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pessoas && pessoas.length > 0 ? (
        <section className={estilos.area} aria-labelledby="busca-pessoas">
          <TituloSecao
            titulo="Fornecedores e clientes"
            explicacao={`${pessoas.length} ${pessoas.length === 1 ? "encontrado" : "encontrados"}`}
            {...(pessoas.length > POR_AREA
              ? { acao: <Link href={`/cadastros?busca=${buscaNaUrl}`}>Ver todos os {pessoas.length} em Cadastros</Link> }
              : {})}
          />
          <ul className={estilos.lista} id="busca-pessoas" aria-label="Fornecedores e clientes encontrados">
            {pessoas.slice(0, POR_AREA).map((pessoa) => (
              <li key={pessoa.pessoaId} className={estilos.item}>
                <span className={estilos.titulo}>{pessoa.nome}</span>
                <span className={estilos.detalhe}>
                  {[pessoa.ehFornecedor ? "Fornecedor" : null, pessoa.ehCliente ? "Cliente" : null].filter(Boolean).join(" e ") ||
                    "Sem papel nesta empresa"}
                  {pessoa.cpfCnpj ? ` · ${pessoa.cpfCnpj}` : ""}
                </span>
                <span className={estilos.acoes}>
                  {pessoa.fornecedorId && vePagar ? (
                    <Link href={`/contas-pagar?fornecedor=${pessoa.fornecedorId}`}>Contas a pagar</Link>
                  ) : null}
                  {pessoa.clienteId && veReceber ? (
                    <Link href={`/contas-receber?cliente=${pessoa.clienteId}`}>Contas a receber</Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
