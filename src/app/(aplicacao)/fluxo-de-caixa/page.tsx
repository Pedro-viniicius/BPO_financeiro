import type { Metadata } from "next";
import Link from "next/link";

import { dataCivilDeTexto, ehDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  GRANULARIDADES,
  NOMES_GRANULARIDADE,
  periodoPadrao,
  type Granularidade,
  type LinhaDoFluxo,
} from "@/modulos/fluxo-caixa/publico";
import { Aviso, Botao, CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./fluxo.module.css";

export const metadata: Metadata = { title: "Fluxo de caixa" };

/**
 * Fluxo de caixa — "de onde veio e para onde foi o dinheiro".
 *
 * A tela inteira gira em torno de uma separacao que nao pode se perder de
 * vista: REALIZADO e dinheiro que ja se moveu; PREVISTO e promessa. Eles nunca
 * somam na mesma linha, e o previsto e marcado de tres formas ao mesmo tempo —
 * selo escrito "Previsto", fundo diferente e tracejado no grafico — porque
 * quem decide com base nesta tela precisa ver a diferenca de relance.
 *
 * O QUE VENCEU E NAO FOI BAIXADO nao entra em periodo nenhum: fica numa faixa
 * propria, acima da tabela, esperando decisao.
 */
export default async function PaginaFluxoDeCaixa({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje } = await exigirContextoFinanceiro("fluxo_caixa.visualizar", "/fluxo-de-caixa");
  const parametros = await searchParams;

  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };
  const data = (chave: string, padrao: DataCivil): DataCivil => {
    const valor = texto(chave);
    return valor && ehDataCivil(valor) ? dataCivilDeTexto(valor) : padrao;
  };

  const padrao = periodoPadrao(hoje);
  const granularidade = (GRANULARIDADES.includes(texto("agrupar") as Granularidade)
    ? texto("agrupar")
    : "mes") as Granularidade;
  const contaEscolhida = texto("conta");

  const filtro = {
    de: data("de", padrao.de),
    ate: data("ate", padrao.ate),
    granularidade,
    ...(contaEscolhida ? { contaBancariaId: contaEscolhida } : {}),
  };

  const [fluxo, contas] = await Promise.all([
    repositorios.fluxoCaixa().montar(escopo, filtro, hoje),
    repositorios.bancos().listar(escopo),
  ]);

  const temMovimento = fluxo.periodos.some((p) => p.quantidade > 0 || !p.entradas.ehZero() || !p.saidas.ehZero());
  const ficaNegativo = fluxo.periodos.some((p) => p.saldoFinal.ehNegativo());
  const nomeDaConta = contas.find((c) => c.id === contaEscolhida)?.nome;

  const entradasDoPeriodo = Dinheiro.somarTodos(fluxo.periodos.filter((p) => p.natureza === "realizado").map((p) => p.entradas));
  const saidasDoPeriodo = Dinheiro.somarTodos(fluxo.periodos.filter((p) => p.natureza === "realizado").map((p) => p.saidas));

  const paraDetalhe = (periodo: LinhaDoFluxo) => {
    const busca = new URLSearchParams({ de: periodo.inicio, ate: periodo.fim, natureza: periodo.natureza });
    if (contaEscolhida) busca.set("conta", contaEscolhida);
    return `/fluxo-de-caixa/detalhe?${busca.toString()}`;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Fluxo de caixa"
        descricao={nomeDaConta ? `Entradas e saídas de ${nomeDaConta}` : "Entradas e saídas de todas as contas"}
      />

      <div className={estilos.resumo}>
        <CartaoResumo
          titulo="Saldo de hoje"
          valor={<ValorFinanceiro valor={fluxo.saldoAtual.paraTexto()} tamanho="destaque" />}
          explicacao={nomeDaConta ? `Somente ${nomeDaConta}.` : "Todas as contas somadas."}
        />
        <CartaoResumo
          titulo="Entrou no período"
          valor={<ValorFinanceiro valor={entradasDoPeriodo.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Apenas o que já aconteceu."
          tom="sucesso"
        />
        <CartaoResumo
          titulo="Saiu no período"
          valor={<ValorFinanceiro valor={saidasDoPeriodo.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Apenas o que já aconteceu."
          tom="neutro"
        />
      </div>

      <form className={estilos.barra} method="get">
        <label className={estilos.campo}>
          De
          <input type="date" name="de" defaultValue={filtro.de} />
        </label>
        <label className={estilos.campo}>
          Até
          <input type="date" name="ate" defaultValue={filtro.ate} />
        </label>
        <label className={estilos.campo}>
          Agrupar
          <select name="agrupar" defaultValue={granularidade}>
            {GRANULARIDADES.map((valor) => (
              <option key={valor} value={valor}>{NOMES_GRANULARIDADE[valor]}</option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          Conta
          <select name="conta" defaultValue={contaEscolhida ?? ""}>
            <option value="">Todas as contas</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.nome}</option>
            ))}
          </select>
        </label>
        <Botao type="submit" variante="secundario">Aplicar</Botao>
        <Link className="acao-secundaria" href="/fluxo-de-caixa">Limpar</Link>
      </form>

      {!fluxo.previstoDisponivel ? (
        <Aviso tom="informacao" titulo="Previsão desligada para uma conta só">
          Uma parcela em aberto ainda não tem conta bancária definida — ela só ganha uma quando é baixada. Prever que ela cai
          nesta conta seria adivinhação. Escolha “Todas as contas” para ver a previsão.
        </Aviso>
      ) : null}

      {fluxo.emAtraso.aPagar.ehPositivo() || fluxo.emAtraso.aReceber.ehPositivo() ? (
        <div className={estilos.atraso}>
          <Aviso tom="atencao" titulo="Há contas vencidas que ainda não foram baixadas">
            Elas não entram em nenhum período: vencer não é a mesma coisa que acontecer. Decida o que fazer com cada uma.
            <span className={estilos.atrasoLinha}>
              {fluxo.emAtraso.aReceber.ehPositivo() ? (
                <Link href="/contas-receber?situacao=vencida">
                  A receber em atraso: {formatarDinheiro(fluxo.emAtraso.aReceber)} ({fluxo.emAtraso.contagemAReceber})
                </Link>
              ) : null}
              {fluxo.emAtraso.aPagar.ehPositivo() ? (
                <Link href="/contas-pagar?situacao=vencida">
                  A pagar em atraso: {formatarDinheiro(fluxo.emAtraso.aPagar)} ({fluxo.emAtraso.contagemAPagar})
                </Link>
              ) : null}
            </span>
          </Aviso>
        </div>
      ) : null}

      {!temMovimento && fluxo.saldoAtual.ehZero() ? (
        <EstadoVazio
          titulo="Ainda não há movimento para mostrar"
          explicacao="O fluxo de caixa nasce dos pagamentos, recebimentos e ajustes já registrados, e das contas em aberto que ainda vão vencer."
          acao={<Link className="acao-primaria" href="/contas-pagar/nova">Cadastrar a primeira conta</Link>}
          ajuda={<Link href="/bancos">Ou cadastre uma conta bancária</Link>}
        />
      ) : (
        <>
          <GraficoDeSaldo periodos={fluxo.periodos} />

          <p className={estilos.legenda}>
            <span><span className={estilos.amostra} style={{ background: "var(--cor-marca-acao)" }} /> Realizado</span>
            <span>
              <span
                className={estilos.amostra}
                style={{
                  background: "repeating-linear-gradient(135deg, var(--cor-marca-media) 0 4px, var(--superficie-realce) 4px 8px)",
                  border: "1px solid var(--cor-marca-borda)",
                }}
              />{" "}
              Previsto
            </span>
            {ficaNegativo ? (
              <span><span className={estilos.amostra} style={{ background: "var(--cor-perigo-forte)" }} /> Saldo negativo</span>
            ) : null}
          </p>

          {ficaNegativo ? (
            <Aviso tom="perigo" titulo="O saldo projetado fica negativo em algum período" urgente>
              Confira as datas de vencimento e o que ainda pode ser recebido antes delas.
            </Aviso>
          ) : null}

          <table className={estilos.tabela}>
            <caption className="apenas-leitor-de-tela">Fluxo de caixa por período</caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">Saldo inicial</th>
                <th scope="col">Entradas</th>
                <th scope="col">Saídas</th>
                <th scope="col">Transferências</th>
                <th scope="col">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {fluxo.periodos.map((periodo) => (
                <tr key={`${periodo.inicio}-${periodo.natureza}`} className={periodo.natureza === "previsto" ? estilos.linhaPrevista : undefined}>
                  <td>
                    {periodo.quantidade > 0 ? <Link href={paraDetalhe(periodo)}>{periodo.rotulo}</Link> : periodo.rotulo}{" "}
                    {periodo.natureza === "previsto" ? <SeloSituacao tom="neutro" rotulo="Previsto" /> : null}
                  </td>
                  <td className={estilos.numeros}>{formatarDinheiro(periodo.saldoInicial)}</td>
                  <td className={`${estilos.numeros} ${periodo.entradas.ehPositivo() ? estilos.positivo : ""}`}>
                    {formatarDinheiro(periodo.entradas)}
                  </td>
                  <td className={estilos.numeros}>{formatarDinheiro(periodo.saidas)}</td>
                  <td className={estilos.numeros}>
                    {periodo.transferenciasLiquidas.ehZero() ? "—" : formatarDinheiro(periodo.transferenciasLiquidas)}
                  </td>
                  <td className={`${estilos.numeros} ${periodo.saldoFinal.ehNegativo() ? estilos.negativo : ""}`}>
                    {formatarDinheiro(periodo.saldoFinal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={estilos.mobileSo}>
            {fluxo.periodos.map((periodo) => (
              <div
                key={`c-${periodo.inicio}-${periodo.natureza}`}
                className={`${estilos.cartaoPeriodo} ${periodo.natureza === "previsto" ? estilos.cartaoPrevisto : ""}`}
              >
                <p className={estilos.cartaoTitulo}>
                  {periodo.quantidade > 0 ? <Link href={paraDetalhe(periodo)}>{periodo.rotulo}</Link> : <span>{periodo.rotulo}</span>}
                  {periodo.natureza === "previsto" ? <SeloSituacao tom="neutro" rotulo="Previsto" /> : null}
                </p>
                <dl className={estilos.cartaoDados}>
                  <dt>Saldo inicial</dt>
                  <dd>{formatarDinheiro(periodo.saldoInicial)}</dd>
                  <dt>Entradas</dt>
                  <dd>{formatarDinheiro(periodo.entradas)}</dd>
                  <dt>Saídas</dt>
                  <dd>{formatarDinheiro(periodo.saidas)}</dd>
                  {periodo.transferenciasLiquidas.ehZero() ? null : (
                    <>
                      <dt>Transferências</dt>
                      <dd>{formatarDinheiro(periodo.transferenciasLiquidas)}</dd>
                    </>
                  )}
                  <dt>Saldo final</dt>
                  <dd className={periodo.saldoFinal.ehNegativo() ? estilos.negativo : ""}>
                    {formatarDinheiro(periodo.saldoFinal)}
                  </dd>
                </dl>
              </div>
            ))}
          </div>

          {fluxo.categorias.length > 0 ? (
            <>
              <TituloSecao
                titulo="Abertura por categoria"
                explicacao={`Apenas o realizado, de ${formatarDataBrasileira(filtro.de)} até hoje.`}
              />
              <table className={estilos.tabela}>
                <caption className="apenas-leitor-de-tela">Entradas e saídas por categoria</caption>
                <thead>
                  <tr>
                    <th scope="col">Categoria</th>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.categorias.map((categoria) => (
                    <tr key={categoria.categoriaNome}>
                      <td>{categoria.categoriaNome}</td>
                      <td className={`${estilos.numeros} ${categoria.entradas.ehPositivo() ? estilos.positivo : ""}`}>
                        {categoria.entradas.ehZero() ? "—" : formatarDinheiro(categoria.entradas)}
                      </td>
                      <td className={estilos.numeros}>
                        {categoria.saidas.ehZero() ? "—" : formatarDinheiro(categoria.saidas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * Grafico de saldo ao longo do periodo.
 *
 * Barras em HTML e CSS, sem biblioteca: sao poucos valores, e uma dependencia
 * de grafico traria peso e licenca para desenhar retangulos. Cada barra tem
 * `title` e texto para leitor de tela — o grafico e reforco, nunca a unica
 * forma de ler o numero, que esta na tabela logo abaixo.
 */
function GraficoDeSaldo({ periodos }: { readonly periodos: readonly LinhaDoFluxo[] }) {
  if (periodos.length === 0) return null;

  const valores = periodos.map((p) => Number(p.saldoFinal.paraTexto()));
  const maximo = Math.max(...valores.map(Math.abs), 1);

  return (
    <div className={estilos.grafico} role="img" aria-label="Saldo ao final de cada período">
      {periodos.map((periodo, indice) => {
        const valor = valores[indice]!;
        const altura = Math.max(2, Math.round((Math.abs(valor) / maximo) * 100));
        const negativo = valor < 0;
        return (
          <div key={`g-${periodo.inicio}-${periodo.natureza}`} className={estilos.coluna}>
            <div className={estilos.trilho}>
              <div
                className={`${estilos.haste} ${periodo.natureza === "previsto" ? estilos.hastePrevista : ""} ${negativo ? estilos.hasteNegativa : ""}`}
                style={{ height: `${altura}%` }}
                title={`${periodo.rotulo}: ${periodo.saldoFinal.formatarBrasileiro()}${periodo.natureza === "previsto" ? " (previsto)" : ""}`}
              />
            </div>
            <span className={estilos.rotuloColuna}>{periodo.rotulo.split(" ")[0]}</span>
          </div>
        );
      })}
    </div>
  );
}
