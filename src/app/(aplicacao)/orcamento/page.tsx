import type { Metadata } from "next";
import Link from "next/link";

import { partesDaData } from "@/compartilhado/datas/indice";
import { NOMES_REGIME, REGIMES, type Regime } from "@/modulos/dre/publico";
import { proporcaoDaBarra, type ExecucaoDoPeriodo, type LinhaDoAcompanhamento } from "@/modulos/orcamento/publico";
import { Aviso, Botao, CabecalhoPagina, CartaoResumo, EstadoVazio, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./orcamento.module.css";

export const metadata: Metadata = { title: "Orçamento" };

const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/**
 * Orcamento — "o que foi planejado esta sendo cumprido?".
 *
 * O REALIZADO desta tela nao e calculado aqui: vem do modulo de Resultados,
 * pelo regime escolhido. Dois calculos para o mesmo numero viram, mais cedo ou
 * mais tarde, dois numeros diferentes — e nenhuma forma de saber qual e o
 * certo.
 *
 * ESTOURO NAO E A MESMA PERGUNTA DOS DOIS LADOS. Gastar mais do que o orcado e
 * ruim; faturar MENOS do que o orcado tambem e. Um unico "realizado maior que
 * planejado = vermelho" marcaria uma receita acima da meta como problema.
 *
 * E o estouro nunca e so cor: tem fundo, borda e a palavra "Estourou".
 */
export default async function PaginaOrcamento({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("orcamento.visualizar", "/orcamento");
  const parametros = await searchParams;

  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const { ano: anoDeHoje, mes: mesDeHoje } = partesDaData(hoje);
  const numero = (chave: string, padrao: number, minimo: number, maximo: number) => {
    const valor = Number(texto(chave));
    return Number.isInteger(valor) && valor >= minimo && valor <= maximo ? valor : padrao;
  };

  const ano = numero("ano", anoDeHoje, 2000, 2200);
  const mes = numero("mes", mesDeHoje, 1, 12);
  const regime = (REGIMES.includes(texto("regime") as Regime) ? texto("regime") : "caixa") as Regime;

  const acompanhamento = await repositorios.orcamento().acompanhar(escopo, ano, mes, regime, hoje);
  const podeEditar = permissoes.has("orcamento.editar");

  const detalhe = (linha: LinhaDoAcompanhamento) => {
    const busca = new URLSearchParams({
      periodo: "personalizado",
      regime,
      de: `${ano}-${String(mes).padStart(2, "0")}-01`,
      ate: ultimoDia(ano, mes),
      linha: linhaDoDre(linha.grupoDre),
      categoria: linha.categoriaNome,
    });
    return `/resultados/detalhe?${busca.toString()}`;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Orçamento"
        descricao={`${NOMES_MES[mes - 1]} de ${ano} · ${NOMES_REGIME[regime]}`}
        acaoPrimaria={
          podeEditar ? (
            <Link className="acao-primaria" href={`/orcamento/planejar?ano=${ano}`}>Planejar {ano}</Link>
          ) : null
        }
      />

      <div className={estilos.indicadores}>
        <CartaoResumo
          titulo="Receita do mês"
          valor={<ValorFinanceiro valor={acompanhamento.receitaNoMes.realizado.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao={`Orçado ${formatarDinheiro(acompanhamento.receitaNoMes.planejado)}.`}
          contagem={rotuloDaExecucao(acompanhamento.receitaNoMes)}
          tom={acompanhamento.receitaNoMes.estourou ? "perigo" : "sucesso"}
        />
        <CartaoResumo
          titulo="Despesa do mês"
          valor={<ValorFinanceiro valor={acompanhamento.despesaNoMes.realizado.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao={`Orçado ${formatarDinheiro(acompanhamento.despesaNoMes.planejado)}.`}
          contagem={rotuloDaExecucao(acompanhamento.despesaNoMes)}
          tom={acompanhamento.despesaNoMes.estourou ? "perigo" : "neutro"}
        />
        <CartaoResumo
          titulo="Acumulado do ano"
          valor={
            <ValorFinanceiro
              valor={acompanhamento.receitaAcumulada.realizado.subtrair(acompanhamento.despesaAcumulada.realizado).paraTexto()}
              tamanho="destaque"
            />
          }
          explicacao={`De janeiro a ${NOMES_MES[mes - 1]}.`}
          contagem={`Receita ${formatarDinheiro(acompanhamento.receitaAcumulada.realizado)} · despesa ${formatarDinheiro(acompanhamento.despesaAcumulada.realizado)}`}
        />
        <CartaoResumo
          titulo="Categorias estouradas"
          valor={<span className={acompanhamento.estouros.length > 0 ? estilos.negativo : ""}>{acompanhamento.estouros.length}</span>}
          explicacao={
            acompanhamento.estouros.length === 0
              ? "Nenhuma categoria fora do planejado neste mês."
              : "Despesa acima ou receita abaixo do orçado."
          }
          tom={acompanhamento.estouros.length > 0 ? "perigo" : "sucesso"}
        />
      </div>

      <form className={estilos.barra} method="get">
        <label className={estilos.campo}>
          Ano
          <input type="number" name="ano" min={2000} max={2200} defaultValue={ano} />
        </label>
        <label className={estilos.campo}>
          Mês
          <select name="mes" defaultValue={mes}>
            {NOMES_MES.map((nome, indice) => (
              <option key={nome} value={indice + 1}>{nome}</option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          Regime
          <select name="regime" defaultValue={regime}>
            {REGIMES.map((valor) => (
              <option key={valor} value={valor}>{NOMES_REGIME[valor]}</option>
            ))}
          </select>
        </label>
        <Botao type="submit" variante="secundario">Aplicar</Botao>
      </form>

      {!acompanhamento.temPlanejamento ? (
        <EstadoVazio
          titulo={`Nada orçado para ${ano}`}
          explicacao="Sem planejamento não há com o que comparar. Você pode começar do zero, copiar o orçamento do ano passado ou partir do que foi realizado."
          acao={podeEditar ? <Link className="acao-primaria" href={`/orcamento/planejar?ano=${ano}`}>Planejar {ano}</Link> : null}
        />
      ) : (
        <>
          {acompanhamento.estouros.length > 0 ? (
            <Aviso tom="perigo" titulo={`${acompanhamento.estouros.length} ${acompanhamento.estouros.length === 1 ? "categoria estourou" : "categorias estouraram"} em ${NOMES_MES[mes - 1]}`} urgente>
              {acompanhamento.estouros
                .slice(0, 4)
                .map((linha) => `${linha.categoriaNome} (${formatarDinheiro(linha.noMes.diferenca.absoluto())})`)
                .join(" · ")}
            </Aviso>
          ) : null}

          <table className={estilos.tabela}>
            <caption className="apenas-leitor-de-tela">
              Planejado e realizado por categoria em {NOMES_MES[mes - 1]} de {ano}
            </caption>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col" className={estilos.numeros}>Planejado</th>
                <th scope="col" className={estilos.numeros}>Realizado</th>
                <th scope="col" className={estilos.numeros}>Diferença</th>
                <th scope="col">Execução</th>
                <th scope="col" className={estilos.numeros}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {acompanhamento.grupos.map((grupo) => (
                <GrupoNaTabela key={grupo.grupo} grupo={grupo} paraDetalhe={detalhe} />
              ))}
            </tbody>
          </table>

          <div className={estilos.celular}>
            {acompanhamento.grupos.flatMap((grupo) =>
              grupo.linhas.map((linha) => (
                <div
                  key={`${grupo.grupo}-${linha.categoriaId}`}
                  className={`${estilos.cartao} ${linha.noMes.estourou ? estilos.cartaoEstourado : ""}`}
                >
                  <p className={estilos.cartaoTopo}>
                    <Link href={detalhe(linha)}>{linha.categoriaNome}</Link>
                    {linha.noMes.estourou ? <span className={estilos.selo}>Estourou</span> : null}
                  </p>
                  <BarraDeExecucao execucao={linha.noMes} />
                  <dl className={estilos.cartaoDados}>
                    <dt>Planejado</dt>
                    <dd>{formatarDinheiro(linha.noMes.planejado)}</dd>
                    <dt>Realizado</dt>
                    <dd>{formatarDinheiro(linha.noMes.realizado)}</dd>
                    <dt>Diferença</dt>
                    <dd className={linha.noMes.estourou ? estilos.negativo : ""}>
                      {formatarDinheiro(linha.noMes.diferenca)}
                    </dd>
                    <dt>Acumulado no ano</dt>
                    <dd>{formatarDinheiro(linha.acumulado.realizado)} de {formatarDinheiro(linha.acumulado.planejado)}</dd>
                  </dl>
                </div>
              )),
            )}
          </div>
        </>
      )}
    </>
  );
}

function GrupoNaTabela({
  grupo,
  paraDetalhe,
}: {
  readonly grupo: { grupo: string; rotulo: string; linhas: readonly LinhaDoAcompanhamento[]; noMes: ExecucaoDoPeriodo; acumulado: ExecucaoDoPeriodo };
  readonly paraDetalhe: (linha: LinhaDoAcompanhamento) => string;
}) {
  return (
    <>
      <tr className={estilos.linhaGrupo}>
        <th scope="row">{grupo.rotulo}</th>
        <td className={estilos.numeros}>{formatarDinheiro(grupo.noMes.planejado)}</td>
        <td className={estilos.numeros}>{formatarDinheiro(grupo.noMes.realizado)}</td>
        <td className={`${estilos.numeros} ${grupo.noMes.estourou ? estilos.negativo : ""}`}>
          {formatarDinheiro(grupo.noMes.diferenca)}
        </td>
        <td><BarraDeExecucao execucao={grupo.noMes} /></td>
        <td className={estilos.numeros}>
          {formatarDinheiro(grupo.acumulado.realizado)} <span className={estilos.percentual}>de {formatarDinheiro(grupo.acumulado.planejado)}</span>
        </td>
      </tr>
      {grupo.linhas.map((linha) => (
        <tr key={linha.categoriaId} className={linha.noMes.estourou ? estilos.estourou : undefined}>
          <td>
            <Link href={paraDetalhe(linha)}>{linha.categoriaNome}</Link>{" "}
            {linha.noMes.estourou ? <span className={estilos.selo}>Estourou</span> : null}
          </td>
          <td className={estilos.numeros}>{formatarDinheiro(linha.noMes.planejado)}</td>
          <td className={estilos.numeros}>{formatarDinheiro(linha.noMes.realizado)}</td>
          <td className={`${estilos.numeros} ${linha.noMes.estourou ? estilos.negativo : ""}`}>
            {formatarDinheiro(linha.noMes.diferenca)}
          </td>
          <td><BarraDeExecucao execucao={linha.noMes} /></td>
          <td className={estilos.numeros}>
            {formatarDinheiro(linha.acumulado.realizado)}{" "}
            <span className={estilos.percentual}>de {formatarDinheiro(linha.acumulado.planejado)}</span>
          </td>
        </tr>
      ))}
    </>
  );
}

/** A barra sempre vem acompanhada do numero: barra sozinha nao se le com precisao. */
function BarraDeExecucao({ execucao }: { readonly execucao: ExecucaoDoPeriodo }) {
  if (execucao.execucao === null) {
    return <span className={estilos.percentual}>Não orçado</span>;
  }
  return (
    <span className={estilos.execucao}>
      <span className={estilos.trilho}>
        <span
          className={`${estilos.preenchido} ${execucao.estourou ? estilos.preenchidoEstourado : ""}`}
          style={{ width: `${proporcaoDaBarra(execucao.execucao)}%` }}
        />
      </span>
      <span className={estilos.percentual}>{execucao.execucao.toLocaleString("pt-BR")}%</span>
    </span>
  );
}

function rotuloDaExecucao(execucao: ExecucaoDoPeriodo): string {
  if (execucao.execucao === null) return "Sem orçamento para o mês";
  return `${execucao.execucao.toLocaleString("pt-BR")}% do orçado`;
}

function ultimoDia(ano: number, mes: number): string {
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** A linha do DRE em que a categoria aparece, para o detalhamento abrir no lugar certo. */
function linhaDoDre(grupo: string | null): string {
  switch (grupo) {
    case "receita_bruta":
      return "receita_bruta";
    case "deducao":
      return "deducoes";
    case "custo":
      return "custos";
    case "resultado_financeiro":
      return "despesas_financeiras";
    case "nao_operacional":
      return "nao_operacional";
    default:
      return "despesas_operacionais";
  }
}
