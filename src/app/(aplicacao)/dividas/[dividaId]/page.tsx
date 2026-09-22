import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NOMES_SISTEMA } from "@/compartilhado/financeiro/indice";
import type { ParcelaDaDivida } from "@/modulos/credito-dividas/publico";
import { CabecalhoPagina, CartaoResumo, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioCancelarDivida } from "./cancelar";
import estilos from "./detalhe.module.css";

export const metadata: Metadata = { title: "Dívida" };

const NOMES_TIPO: Record<string, string> = {
  emprestimo: "Empréstimo",
  financiamento: "Financiamento",
  cartao_credito: "Cartão de crédito",
  cheque_especial: "Cheque especial",
  outro: "Outro",
};

const ROTULO_SITUACAO: Record<ParcelaDaDivida["situacao"], string> = {
  aberta: "Em aberto",
  vencida: "Vencida",
  parcial: "Parcial",
  liquidada: "Paga",
  cancelada: "Cancelada",
};

/**
 * Uma divida por dentro: cronograma, saldo devedor e o que ja foi pago.
 *
 * A coluna "Saldo devedor" e a do CRONOGRAMA ORIGINAL — o que se deveria dever
 * apos cada parcela. O saldo real do topo desce so quando a parcela e paga de
 * verdade, em Contas a pagar. Ver as duas coisas lado a lado e o que responde
 * "estou em dia com o contrato?".
 */
export default async function PaginaDivida({ params }: { params: Promise<{ dividaId: string }> }) {
  const { dividaId } = await params;
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("dividas.visualizar", "/dividas");

  const divida = await repositorios.dividas().buscarPorId(escopo, dividaId, hoje);
  if (!divida) notFound();

  const podeEditar = permissoes.has("dividas.editar");
  const encerrada = divida.situacao === "quitada" || divida.situacao === "cancelada";
  const amortizado = divida.valorPrincipal.subtrair(divida.saldoDevedor);

  return (
    <>
      <CabecalhoPagina
        titulo={divida.codigo}
        descricao={`${divida.descricao} · ${divida.credorNome}`}
        acoesSecundarias={<Link className="acao-secundaria" href="/dividas">Voltar para a lista</Link>}
      />

      <div className={estilos.indicadores}>
        <CartaoResumo
          titulo="Saldo devedor"
          valor={<ValorFinanceiro valor={divida.saldoDevedor.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="O contratado menos as amortizações das parcelas já pagas."
          contagem={`${divida.parcelasPagas} de ${divida.quantidadeParcelas} parcelas pagas`}
          tom={divida.saldoDevedor.ehZero() ? "sucesso" : "neutro"}
        />
        <CartaoResumo
          titulo="Já amortizado"
          valor={<ValorFinanceiro valor={amortizado.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="A parte das parcelas que abateu a dívida. Não é despesa: é dívida virando patrimônio."
          contagem={`De ${formatarDinheiro(divida.valorPrincipal)} contratados`}
          tom="neutro"
        />
        <CartaoResumo
          titulo="Juros pagos"
          valor={<ValorFinanceiro valor={divida.jurosPagos.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Os juros do contrato já desembolsados. Nos Resultados eles entram como despesa financeira, somados a eventuais juros de atraso."
          contagem={`De ${formatarDinheiro(divida.totalDeJuros)} previstos no contrato`}
          tom="neutro"
        />
      </div>

      <section>
        <TituloSecao titulo="Contrato" nivel={2} />
        <dl className={estilos.contrato}>
          <div><dt>Credor</dt><dd>{divida.credorNome}</dd></div>
          <div><dt>Tipo</dt><dd>{NOMES_TIPO[divida.tipo] ?? divida.tipo}</dd></div>
          <div><dt>Número do contrato</dt><dd>{divida.numeroContrato ?? "—"}</dd></div>
          <div><dt>Contratação</dt><dd>{formatarDataBrasileira(divida.dataContratacao)}</dd></div>
          <div><dt>Valor contratado</dt><dd>{formatarDinheiro(divida.valorPrincipal)}</dd></div>
          <div>
            <dt>Taxa</dt>
            <dd>{divida.taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% ao mês</dd>
          </div>
          <div><dt>Sistema</dt><dd>{NOMES_SISTEMA[divida.sistema]}</dd></div>
          <div><dt>Categoria dos juros</dt><dd>{divida.categoriaJurosNome}</dd></div>
          {divida.observacoes ? <div className={estilos.largo}><dt>Observações</dt><dd>{divida.observacoes}</dd></div> : null}
        </dl>
      </section>

      <section>
        <TituloSecao
          titulo="Cronograma"
          explicacao="Cada parcela é uma conta a pagar. O pagamento, o estorno e o desconto acontecem lá."
          {...(divida.tituloPagarId
            ? { acao: <Link className="acao-secundaria" href={`/contas-pagar?busca=${divida.codigo}`}>Ver em Contas a pagar</Link> }
            : {})}
        />
        <table className={estilos.cronograma}>
          <thead>
            <tr>
              <th scope="col">Parcela</th>
              <th scope="col">Vencimento</th>
              <th scope="col" className={estilos.numerico}>Amortização</th>
              <th scope="col" className={estilos.numerico}>Juros</th>
              <th scope="col" className={estilos.numerico}>Parcela</th>
              <th scope="col" className={estilos.numerico}>Saldo previsto</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {divida.parcelas.map((parcela) => (
              <tr key={parcela.id}>
                <td data-rotulo="Parcela" className={estilos.numero}>
                  {parcela.numeroParcela}/{divida.quantidadeParcelas}
                </td>
                <td data-rotulo="Vencimento">{formatarDataBrasileira(parcela.dataVencimento)}</td>
                <td data-rotulo="Amortização" className={estilos.numerico}>{formatarDinheiro(parcela.valorAmortizacao)}</td>
                <td data-rotulo="Juros" className={estilos.numerico}>{formatarDinheiro(parcela.valorJuros)}</td>
                <td data-rotulo="Parcela" className={estilos.numerico}>
                  <strong>{formatarDinheiro(parcela.valorTotal)}</strong>
                </td>
                <td data-rotulo="Saldo previsto" className={estilos.numerico}>{formatarDinheiro(parcela.saldoDevedor)}</td>
                <td data-rotulo="Situação">
                  <SeloSituacao rotulo={ROTULO_SITUACAO[parcela.situacao]} tom={tomDaSituacao(parcela.situacao)} />
                  {parcela.parcelaPagarId ? (
                    <>
                      {" "}
                      <Link className={estilos.ligacao} href={`/contas-pagar/${parcela.parcelaPagarId}`}>
                        {parcela.situacao === "liquidada" ? "ver baixa" : "pagar"}
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Total</th>
              <td className={estilos.numerico}>{formatarDinheiro(divida.valorPrincipal)}</td>
              <td className={estilos.numerico}>{formatarDinheiro(divida.totalDeJuros)}</td>
              <td className={estilos.numerico}>
                <strong>{formatarDinheiro(divida.valorPrincipal.somar(divida.totalDeJuros))}</strong>
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </section>

      {podeEditar && !encerrada ? (
        <section>
          <TituloSecao titulo="Cancelar dívida" nivel={2} />
          <FormularioCancelarDivida dividaId={divida.id} codigo={divida.codigo} parcelasPagas={divida.parcelasPagas} />
        </section>
      ) : null}

      {divida.situacao === "cancelada" ? (
        <p className={estilos.cancelada}>
          Esta dívida foi cancelada. As parcelas que ainda não tinham sido pagas foram canceladas junto; o que já havia
          sido pago continua registrado, porque o dinheiro saiu de verdade.
        </p>
      ) : null}
    </>
  );
}
