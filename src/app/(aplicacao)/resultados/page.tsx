import type { Metadata } from "next";
import Link from "next/link";

import { dataCivilDeTexto, ehDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import {
  ATALHOS,
  EXPLICACAO_REGIME,
  intervaloDoAtalho,
  NOMES_ATALHO,
  NOMES_REGIME,
  REGIMES,
  type AtalhoDePeriodo,
  type LinhaDoResultado,
  type MesDoResultado,
  type Regime,
} from "@/modulos/dre/publico";
import { Aviso, Botao, CabecalhoPagina, CartaoResumo, EstadoVazio, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./resultados.module.css";

export const metadata: Metadata = { title: "Resultados" };

/**
 * Resultados — "a Nova Didata teve lucro ou prejuizo, e onde?".
 *
 * A tela inteira gira em torno do SELETOR DE REGIME, e isso nao e detalhe de
 * interface: caixa e competencia respondem perguntas diferentes sobre o mesmo
 * mes. Uma escola que fatura em janeiro e recebe em marco tem lucro em janeiro
 * por competencia e caixa vazio ate marco — quem olha so um dos dois decide
 * errado. Por isso o regime aparece no filtro, no titulo do comparativo e no
 * arquivo exportado.
 *
 * Nenhum numero desta tela e calculado aqui: tudo vem do modulo `dre`, que e a
 * mesma fonte que a tela de Inicio usa. Dois calculos para o mesmo numero
 * viram, mais cedo ou mais tarde, dois numeros diferentes.
 */
export default async function PaginaResultados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("dre.visualizar", "/resultados");
  const parametros = await searchParams;

  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const atalho = (ATALHOS.includes(texto("periodo") as AtalhoDePeriodo) ? texto("periodo") : "mes_atual") as AtalhoDePeriodo;
  const padrao = intervaloDoAtalho(atalho, hoje);
  const data = (chave: string, alternativa: DataCivil): DataCivil => {
    const valor = texto(chave);
    return atalho === "personalizado" && valor && ehDataCivil(valor) ? dataCivilDeTexto(valor) : alternativa;
  };

  const regime = (REGIMES.includes(texto("regime") as Regime) ? texto("regime") : "caixa") as Regime;
  const contaEscolhida = regime === "caixa" ? texto("conta") : undefined;

  const filtro = {
    de: data("de", padrao.de),
    ate: data("ate", padrao.ate),
    regime,
    ...(contaEscolhida ? { contaBancariaId: contaEscolhida } : {}),
  };

  const [resultado, contas] = await Promise.all([
    repositorios.resultados().montar(escopo, filtro, hoje),
    repositorios.bancos().listar(escopo),
  ]);

  const podeExportar = permissoes.has("dre.exportar");
  const nomeDaConta = contas.find((c) => c.id === contaEscolhida)?.nome;
  const periodoLegivel = `${formatarDataBrasileira(filtro.de)} a ${formatarDataBrasileira(filtro.ate)}`;

  const parametrosAtuais = new URLSearchParams({ periodo: atalho, regime, de: filtro.de, ate: filtro.ate });
  if (contaEscolhida) parametrosAtuais.set("conta", contaEscolhida);
  const rotaDoCsv = `/resultados/csv?${parametrosAtuais.toString()}`;

  const detalhe = (linha: LinhaDoResultado, mes?: MesDoResultado, categoria?: string) => {
    const busca = new URLSearchParams(parametrosAtuais);
    busca.set("linha", linha.linha);
    if (mes) busca.set("mes", mes.competencia);
    if (categoria) busca.set("categoria", categoria);
    return `/resultados/detalhe?${busca.toString()}`;
  };

  const simples = resultado.linhas.filter((linha) => !linha.ehSubtotal);
  const temMovimento = resultado.temDados;

  return (
    <>
      <CabecalhoPagina
        titulo="Resultados"
        descricao={`${NOMES_REGIME[regime]} · ${periodoLegivel}${nomeDaConta ? ` · ${nomeDaConta}` : ""}`}
        acaoPrimaria={
          podeExportar && temMovimento ? (
            <a className="acao-primaria" href={rotaDoCsv} download>
              Exportar CSV
            </a>
          ) : null
        }
      />

      <div className={estilos.indicadores}>
        <CartaoResumo
          titulo="Receita líquida"
          valor={<ValorFinanceiro valor={resultado.indicadores.receitaLiquida.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Depois das deduções e dos descontos concedidos."
          tom="sucesso"
        />
        <CartaoResumo
          titulo="Despesas"
          valor={<ValorFinanceiro valor={resultado.indicadores.despesaTotal.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Custos, despesas operacionais e financeiras."
        />
        <CartaoResumo
          titulo={resultado.indicadores.resultado.ehNegativo() ? "Prejuízo do período" : "Lucro do período"}
          valor={<ValorFinanceiro valor={resultado.indicadores.resultado.paraTexto()} tamanho="destaque" />}
          explicacao={EXPLICACAO_REGIME[regime]}
          tom={resultado.indicadores.resultado.ehNegativo() ? "perigo" : "sucesso"}
        />
        <CartaoResumo
          titulo="Margem"
          valor={
            <span className={resultado.indicadores.margem !== null && resultado.indicadores.margem < 0 ? estilos.negativo : ""}>
              {resultado.indicadores.margem === null ? "—" : `${resultado.indicadores.margem.toLocaleString("pt-BR")}%`}
            </span>
          }
          explicacao={
            resultado.indicadores.margem === null
              ? "Sem receita no período, não há margem para calcular."
              : "Quanto sobra de cada real de receita líquida."
          }
        />
      </div>

      <form className={estilos.barra} method="get">
        <label className={estilos.campo}>
          Regime
          <select name="regime" defaultValue={regime}>
            {REGIMES.map((valor) => (
              <option key={valor} value={valor}>{NOMES_REGIME[valor]}</option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          Período
          <select name="periodo" defaultValue={atalho}>
            {ATALHOS.map((valor) => (
              <option key={valor} value={valor}>{NOMES_ATALHO[valor]}</option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          De
          <input type="date" name="de" defaultValue={filtro.de} />
        </label>
        <label className={estilos.campo}>
          Até
          <input type="date" name="ate" defaultValue={filtro.ate} />
        </label>
        {resultado.filtroPorContaDisponivel ? (
          <label className={estilos.campo}>
            Conta
            <select name="conta" defaultValue={contaEscolhida ?? ""}>
              <option value="">Todas as contas</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>{conta.nome}</option>
              ))}
            </select>
          </label>
        ) : null}
        <Botao type="submit" variante="secundario">Aplicar</Botao>
        <Link className="acao-secundaria" href="/resultados">Limpar</Link>
        <p className={estilos.explicacaoRegime}>
          <strong>{NOMES_REGIME[regime]}:</strong> {EXPLICACAO_REGIME[regime]}{" "}
          {atalho === "personalizado" ? "" : "As datas acompanham o período escolhido."}
        </p>
      </form>

      {regime === "competencia" ? (
        <Aviso tom="informacao" titulo="Competência trabalha com meses inteiros">
          O mês é a unidade da competência. Mesmo com datas quebradas no filtro, o demonstrativo cobre os meses completos do
          período — e o filtro por conta bancária fica desligado, porque uma conta em aberto ainda não tem conta bancária.
        </Aviso>
      ) : null}

      {!temMovimento ? (
        <EstadoVazio
          titulo="Nenhum lançamento neste período"
          explicacao={
            regime === "caixa"
              ? "O resultado por caixa nasce das baixas registradas. Registre um pagamento ou recebimento para começar."
              : "O resultado por competência nasce dos títulos. Cadastre uma conta a pagar ou a receber para começar."
          }
          acao={<Link className="acao-primaria" href="/contas-receber/nova">Nova conta a receber</Link>}
          ajuda={<Link href="/contas-pagar/nova">Ou cadastre uma conta a pagar</Link>}
        />
      ) : (
        <>
          <GraficoDoResultado meses={resultado.meses} linhas={resultado.linhas} />

          <p className={estilos.legenda}>
            <span><span className={`${estilos.amostra} ${estilos.hasteReceita}`} /> Receita líquida</span>
            <span><span className={`${estilos.amostra} ${estilos.hasteDespesa}`} /> Despesas</span>
            <span><span className={`${estilos.amostra} ${estilos.hasteResultado}`} /> Resultado</span>
          </p>

          <table className={estilos.tabela}>
            <caption className="apenas-leitor-de-tela">
              Demonstrativo de resultados por {NOMES_REGIME[regime].toLowerCase()}, {periodoLegivel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Linha</th>
                {resultado.meses.map((mes) => (
                  <th key={mes.competencia} scope="col" className={estilos.numeros}>{mes.rotuloCurto}</th>
                ))}
                <th scope="col" className={estilos.numeros}>Total</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((linha) => (
                <LinhasDaTabela
                  key={linha.linha}
                  linha={linha}
                  meses={resultado.meses}
                  paraDetalhe={detalhe}
                />
              ))}
            </tbody>
          </table>

          <div className={estilos.celular}>
            {resultado.linhas.map((linha) => (
              <div
                key={`c-${linha.linha}`}
                className={`${estilos.cartaoLinha} ${linha.destaque ? estilos.cartaoDestaque : ""}`}
              >
                <p className={estilos.cartaoTopo}>
                  <span>
                    {linha.ehSubtotal || linha.total.ehZero() ? (
                      linha.rotulo
                    ) : (
                      <Link href={detalhe(linha)}>{linha.rotulo}</Link>
                    )}
                    <span className={estilos.explicacaoLinha}>{linha.explicacao}</span>
                  </span>
                  <span className={`${estilos.cartaoValor} ${linha.total.ehNegativo() ? estilos.negativo : ""}`}>
                    {formatarDinheiro(linha.total)}
                  </span>
                </p>
                {linha.categorias.length > 0 ? (
                  <dl className={estilos.cartaoCategorias}>
                    {linha.categorias.map((categoria) => (
                      <div key={categoria.categoriaNome} style={{ display: "contents" }}>
                        <dt>{categoria.categoriaNome}</dt>
                        <dd>{formatarDinheiro(categoria.total)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ))}
          </div>

          {simples.every((linha) => linha.categorias.length === 0) ? null : (
            <p className={estilos.explicacaoRegime}>
              Clique em uma linha ou em um valor para ver os lançamentos que o compõem.
            </p>
          )}
        </>
      )}
    </>
  );
}

/**
 * Uma linha do demonstrativo, mais as categorias dela.
 *
 * As categorias ficam dentro de `<details>`, que abre e fecha sem JavaScript.
 * Linha sem categoria (ou subtotal) nao vira dobra: um triangulo que nao abre
 * nada e pior do que nenhum triangulo.
 */
function LinhasDaTabela({
  linha,
  meses,
  paraDetalhe,
}: {
  readonly linha: LinhaDoResultado;
  readonly meses: readonly MesDoResultado[];
  readonly paraDetalhe: (linha: LinhaDoResultado, mes?: MesDoResultado, categoria?: string) => string;
}) {
  const classe = linha.destaque ? estilos.linhaDestaque : "";
  const valorDoMes = (valor: { ehNegativo: () => boolean; ehZero: () => boolean }) =>
    valor.ehNegativo() ? estilos.negativo : "";

  return (
    <>
      <tr className={classe}>
        <th scope="row">
          {linha.ehSubtotal || linha.total.ehZero() ? (
            linha.rotulo
          ) : linha.categorias.length > 0 ? (
            <details className={estilos.dobra}>
              <summary className={estilos.gatilho}>{linha.rotulo}</summary>
              <span className={estilos.explicacaoLinha}>{linha.explicacao}</span>
            </details>
          ) : (
            <Link href={paraDetalhe(linha)}>{linha.rotulo}</Link>
          )}
        </th>
        {linha.porMes.map((valor, indice) => {
          const mes = meses[indice]!;
          const variacao = linha.variacoes[indice];
          return (
            <td key={mes.competencia} className={`${estilos.numeros} ${valorDoMes(valor)}`}>
              {valor.ehZero() || linha.ehSubtotal ? (
                formatarDinheiro(valor)
              ) : (
                <Link href={paraDetalhe(linha, mes)}>{formatarDinheiro(valor)}</Link>
              )}
              {variacao !== null && variacao !== undefined ? (
                <span className={`${estilos.variacao} ${variacao < 0 ? estilos.negativo : estilos.positivo}`}>
                  {variacao > 0 ? "+" : ""}
                  {variacao.toLocaleString("pt-BR")}%
                </span>
              ) : null}
            </td>
          );
        })}
        <td className={`${estilos.numeros} ${valorDoMes(linha.total)}`}>{formatarDinheiro(linha.total)}</td>
      </tr>

      {linha.categorias.map((categoria) => (
        <tr key={`${linha.linha}-${categoria.categoriaNome}`} className={estilos.linhaCategoria}>
          <td>
            <Link href={paraDetalhe(linha, undefined, categoria.categoriaNome)}>{categoria.categoriaNome}</Link>
          </td>
          {categoria.porMes.map((valor, indice) => (
            <td key={meses[indice]!.competencia} className={`${estilos.numeros} ${valorDoMes(valor)}`}>
              {formatarDinheiro(valor)}
            </td>
          ))}
          <td className={`${estilos.numeros} ${valorDoMes(categoria.total)}`}>{formatarDinheiro(categoria.total)}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * Receita, despesa e resultado lado a lado, mes a mes.
 *
 * Barras em HTML e CSS, sem biblioteca: sao tres valores por mes, e uma
 * dependencia de grafico traria peso e licenca para desenhar retangulos. Cada
 * barra tem `title`, e a tabela logo acima traz os mesmos numeros — o grafico
 * e reforco, nunca a unica forma de ler.
 */
function GraficoDoResultado({
  meses,
  linhas,
}: {
  readonly meses: readonly MesDoResultado[];
  readonly linhas: readonly LinhaDoResultado[];
}) {
  if (meses.length === 0) return null;

  const serie = (nome: string) => linhas.find((linha) => linha.linha === nome)?.porMes ?? [];
  const receitas = serie("receita_liquida");
  const resultados = serie("resultado_periodo");
  const custos = serie("custos");
  const operacionais = serie("despesas_operacionais");
  const financeiras = serie("despesas_financeiras");

  const despesas = meses.map((_, indice) =>
    (custos[indice]?.somar(operacionais[indice]!) ?? operacionais[indice]!).somar(financeiras[indice]!),
  );

  const numero = (valor: { paraTexto: () => string } | undefined) => Number(valor?.paraTexto() ?? "0");
  const maximo = Math.max(
    ...meses.map((_, i) => Math.max(Math.abs(numero(receitas[i])), Math.abs(numero(despesas[i])), Math.abs(numero(resultados[i])))),
    1,
  );
  const altura = (valor: number) => `${Math.max(2, Math.round((Math.abs(valor) / maximo) * 100))}%`;

  return (
    <div className={estilos.grafico} role="img" aria-label="Receita, despesa e resultado por mês">
      {meses.map((mes, indice) => (
        <div key={mes.competencia} className={estilos.grupoDeBarras}>
          <div className={estilos.trilho}>
            <div
              className={`${estilos.haste} ${estilos.hasteReceita}`}
              style={{ height: altura(numero(receitas[indice])) }}
              title={`${mes.rotulo} · receita líquida ${receitas[indice]?.formatarBrasileiro() ?? "R$ 0,00"}`}
            />
            <div
              className={`${estilos.haste} ${estilos.hasteDespesa}`}
              style={{ height: altura(numero(despesas[indice])) }}
              title={`${mes.rotulo} · despesas ${despesas[indice]?.formatarBrasileiro() ?? "R$ 0,00"}`}
            />
            <div
              className={`${estilos.haste} ${estilos.hasteResultado}`}
              style={{ height: altura(numero(resultados[indice])) }}
              title={`${mes.rotulo} · resultado ${resultados[indice]?.formatarBrasileiro() ?? "R$ 0,00"}`}
            />
          </div>
          <span className={estilos.rotuloMes}>{mes.rotuloCurto}</span>
        </div>
      ))}
    </div>
  );
}
