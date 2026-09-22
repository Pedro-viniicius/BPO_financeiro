import type { Metadata } from "next";
import Link from "next/link";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { NOMES_SISTEMA } from "@/compartilhado/financeiro/indice";
import type { DividaNaLista } from "@/modulos/credito-dividas/publico";
import { CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./dividas.module.css";

export const metadata: Metadata = { title: "Dívidas" };

const NOMES_TIPO: Record<string, string> = {
  emprestimo: "Empréstimo",
  financiamento: "Financiamento",
  cartao_credito: "Cartão de crédito",
  cheque_especial: "Cheque especial",
  outro: "Outro",
};

const SITUACAO: Record<DividaNaLista["situacao"], { rotulo: string; tom: "sucesso" | "perigo" | "atencao" | "neutro" }> = {
  em_dia: { rotulo: "Em dia", tom: "sucesso" },
  em_atraso: { rotulo: "Em atraso", tom: "perigo" },
  quitada: { rotulo: "Quitada", tom: "neutro" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
};

/**
 * Dividas — "quanto devemos, para quem e quando vence".
 *
 * A tela NAO paga nada. Cada parcela desta lista e uma conta a pagar de
 * verdade, criada junto com a divida; quem da baixa e o fluxo normal de
 * Contas a pagar, com estorno, desconto e conciliacao ja prontos. Um segundo
 * caminho de pagamento significaria manter duas vezes cada regra de dinheiro.
 */
export default async function PaginaDividas() {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("dividas.visualizar", "/dividas");
  const repositorio = repositorios.dividas();
  const [lista, painel] = await Promise.all([repositorio.listar(escopo, hoje), repositorio.painel(escopo, hoje)]);
  const podeEditar = permissoes.has("dividas.editar");

  const ativas = lista.filter((divida) => divida.situacao !== "quitada" && divida.situacao !== "cancelada");
  const encerradas = lista.filter((divida) => divida.situacao === "quitada" || divida.situacao === "cancelada");

  return (
    <>
      <CabecalhoPagina
        titulo="Dívidas"
        descricao="Empréstimos, financiamentos e parcelamentos"
        acaoPrimaria={podeEditar ? <Link className="acao-primaria" href="/dividas/nova">Registrar dívida</Link> : null}
      />

      <div className={estilos.indicadores}>
        <CartaoResumo
          titulo="Endividamento total"
          valor={<ValorFinanceiro valor={painel.endividamentoTotal.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Saldo devedor das dívidas ativas: o contratado menos o que já foi amortizado."
          contagem={`${painel.dividasAtivas} ${painel.dividasAtivas === 1 ? "dívida ativa" : "dívidas ativas"}`}
          tom={painel.endividamentoTotal.ehZero() ? "sucesso" : "neutro"}
        />
        <CartaoResumo
          titulo="Próximos 12 meses"
          valor={<ValorFinanceiro valor={painel.totalProximosDozeMeses.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Parcelas em aberto que vencem no próximo ano. Já aparecem no Fluxo de caixa."
          contagem={`${painel.proximosDozeMeses.length} ${painel.proximosDozeMeses.length === 1 ? "parcela" : "parcelas"}`}
          tom="neutro"
        />
        <CartaoResumo
          titulo="Juros pagos no ano"
          valor={<ValorFinanceiro valor={painel.jurosPagosNoAno.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="O custo do dinheiro, pela data da baixa. Nos Resultados entra como despesa financeira, somado aos juros de atraso."
          contagem="Ano corrente"
          tom="neutro"
        />
        <CartaoResumo
          titulo="Parcelas em atraso"
          valor={<strong className={estilos.contador}>{painel.parcelasEmAtraso}</strong>}
          explicacao="Parcelas vencidas e ainda em aberto."
          contagem={painel.parcelasEmAtraso === 0 ? "Nenhuma pendência" : "Exige atenção"}
          tom={painel.parcelasEmAtraso === 0 ? "sucesso" : "perigo"}
        />
      </div>

      {lista.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma dívida registrada"
          explicacao="Registre um empréstimo ou financiamento para acompanhar saldo devedor, juros e parcelas. Cada parcela vira uma conta a pagar automaticamente."
          acao={podeEditar ? <Link className="acao-primaria" href="/dividas/nova">Registrar dívida</Link> : undefined}
        />
      ) : (
        <>
          <TituloSecao titulo="Em andamento" />
          {ativas.length === 0 ? (
            <p className={estilos.vazioSecao}>Nenhuma dívida em andamento.</p>
          ) : (
            <ul className={estilos.lista}>
              {ativas.map((divida) => <CartaoDivida key={divida.id} divida={divida} />)}
            </ul>
          )}

          {encerradas.length > 0 ? (
            <details className={estilos.encerradas}>
              <summary>Dívidas encerradas ({encerradas.length})</summary>
              <ul className={estilos.lista}>
                {encerradas.map((divida) => <CartaoDivida key={divida.id} divida={divida} />)}
              </ul>
            </details>
          ) : null}

          {painel.proximosDozeMeses.length > 0 ? (
            <section>
              <TituloSecao
                titulo="Próximos vencimentos"
                explicacao="As parcelas em aberto dos próximos 12 meses. O pagamento é feito em Contas a pagar."
              />
              <table className={estilos.vencimentos}>
                <thead>
                  <tr>
                    <th scope="col">Vencimento</th>
                    <th scope="col">Dívida</th>
                    <th scope="col">Credor</th>
                    <th scope="col" className={estilos.numerico}>Valor</th>
                    <th scope="col"><span className="apenas-leitor-de-tela">Ação</span></th>
                  </tr>
                </thead>
                <tbody>
                  {painel.proximosDozeMeses.map((parcela, indice) => (
                    <tr key={`${parcela.dividaId}-${indice}`}>
                      <td data-rotulo="Vencimento">{formatarDataBrasileira(parcela.dataVencimento)}</td>
                      <td data-rotulo="Dívida">
                        <Link href={`/dividas/${parcela.dividaId}`}>{parcela.codigo}</Link>
                      </td>
                      <td data-rotulo="Credor">{parcela.credorNome}</td>
                      <td data-rotulo="Valor" className={estilos.numerico}>{formatarDinheiro(parcela.valorTotal)}</td>
                      <td data-rotulo="Ação">
                        {parcela.parcelaPagarId ? (
                          <Link href={`/contas-pagar/${parcela.parcelaPagarId}`}>Ver conta a pagar</Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

function CartaoDivida({ divida }: { readonly divida: DividaNaLista }) {
  const quitado = divida.valorPrincipal.ehZero()
    ? 0
    : Math.min(100, Math.max(0, Math.round(
        (Number(divida.valorPrincipal.subtrair(divida.saldoDevedor).paraTexto()) /
          Number(divida.valorPrincipal.paraTexto())) * 100,
      )));
  const situacao = SITUACAO[divida.situacao];

  return (
    <li className={estilos.cartao}>
      <div className={estilos.cartaoTopo}>
        <div>
          <Link className={estilos.codigo} href={`/dividas/${divida.id}`}>{divida.codigo}</Link>
          <p className={estilos.descricao}>{divida.descricao}</p>
          <p className={estilos.credor}>
            {divida.credorNome} · {NOMES_TIPO[divida.tipo] ?? divida.tipo} · {NOMES_SISTEMA[divida.sistema]}
          </p>
        </div>
        <SeloSituacao rotulo={situacao.rotulo} tom={situacao.tom} />
      </div>

      <dl className={estilos.numeros}>
        <div>
          <dt>Saldo devedor</dt>
          <dd><ValorFinanceiro valor={divida.saldoDevedor.paraTexto()} comCor={false} /></dd>
        </div>
        <div>
          <dt>Contratado</dt>
          <dd>{formatarDinheiro(divida.valorPrincipal)}</dd>
        </div>
        <div>
          <dt>Taxa</dt>
          <dd>{divida.taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.</dd>
        </div>
        <div>
          <dt>Parcelas</dt>
          <dd>{divida.parcelasPagas} de {divida.quantidadeParcelas} pagas</dd>
        </div>
        <div>
          <dt>Próximo vencimento</dt>
          <dd>
            {divida.proximoVencimento
              ? `${formatarDataBrasileira(divida.proximoVencimento)} · ${formatarDinheiro(divida.proximaParcela ?? Dinheiro.zero())}`
              : "—"}
          </dd>
        </div>
      </dl>

      <p className={estilos.progresso}>
        <span className={estilos.barra} aria-hidden="true">
          <span className={estilos.barraCheia} style={{ inlineSize: `${quitado}%` }} />
        </span>
        <span>{quitado}% do valor contratado já amortizado</span>
      </p>

      {divida.parcelasEmAtraso > 0 ? (
        <p className={estilos.atraso}>
          {divida.parcelasEmAtraso === 1
            ? "1 parcela vencida e não paga."
            : `${divida.parcelasEmAtraso} parcelas vencidas e não pagas.`}
        </p>
      ) : null}
    </li>
  );
}
