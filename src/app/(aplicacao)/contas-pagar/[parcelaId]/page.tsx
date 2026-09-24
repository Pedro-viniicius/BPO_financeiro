import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { NOMES_SITUACAO_PAGAR } from "@/compartilhado/financeiro/indice";
import { Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { NOMES_FORMA_PAGAMENTO, type FormaDePagamento } from "../../_apoio/formas-de-pagamento";
import { FormularioCancelamento } from "./formulario-cancelamento";
import { FormularioPagamento } from "./formulario-pagamento";
import { BotaoEstornar } from "./botao-estornar";
import estilos from "./detalhe.module.css";

export const metadata: Metadata = { title: "Conta a pagar" };

/**
 * Detalhe de uma conta a pagar: quanto era, quanto foi pago, quanto falta, e
 * o historico de cada pagamento — inclusive os estornados.
 *
 * `buscarPorId` recebe o escopo da empresa junto com o id — saber o UUID de uma
 * conta de outra empresa nao abre nada, devolve `notFound()`.
 *
 * O historico NUNCA some. Um pagamento estornado continua na lista, riscado e
 * com o selo "Estornado": e assim que a tela conta a mesma historia que o
 * extrato do banco, onde o dinheiro saiu e voltou.
 */
export default async function PaginaContaPagar({ params }: { params: Promise<{ parcelaId: string }> }) {
  const { parcelaId } = await params;
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("contas_pagar.visualizar", `/contas-pagar/${parcelaId}`);

  const conta = await repositorios.contasPagar().buscarPorId(escopo, parcelaId, hoje);
  if (!conta) notFound();

  const contas = await repositorios.bancos().listar(escopo);
  const podePagar = permissoes.has("contas_pagar.pagar");
  const podeEditar = permissoes.has("contas_pagar.editar");
  const podeCancelar = permissoes.has("contas_pagar.cancelar");
  const emAberto = conta.situacao !== "liquidada" && conta.situacao !== "cancelada";
  const parcelada = conta.parcelas.length > 1;
  const saldoDoTitulo = Dinheiro.somarTodos(conta.parcelas.map((p) => p.saldo));

  return (
    <>
      <CabecalhoPagina
        titulo={conta.descricao}
        descricao={`${conta.codigo} · ${conta.fornecedorNome}${parcelada ? ` · parcela ${conta.numeroParcela}/${conta.quantidadeParcelas}` : ""}`}
        acaoPrimaria={
          podeEditar && !conta.tituloCancelado ? (
            <Link className="acao-secundaria" href={`/contas-pagar/${conta.parcelaId}/editar`}>Editar</Link>
          ) : null
        }
        acoesSecundarias={<Link className="acao-secundaria" href="/contas-pagar">Voltar para a lista</Link>}
      />

      {conta.tituloCancelado ? (
        <Aviso tom="atencao" titulo="Esta conta foi cancelada">
          {conta.motivoCancelamento ? `Motivo: ${conta.motivoCancelamento}` : "Nenhum motivo foi registrado."}
          {conta.valorCancelado.ehPositivo()
            ? ` Deixaram de ser pagos ${formatarDinheiro(conta.valorCancelado)}.`
            : ""}
        </Aviso>
      ) : null}

      <div className={estilos.resumo}>
        <CartaoResumo
          titulo="Quanto ainda falta pagar"
          valor={<ValorFinanceiro valor={conta.saldo.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao={`De ${formatarDinheiro(conta.valorOriginal)}, já foram pagos ${formatarDinheiro(conta.valorPago)}.`}
          tom={tomDaSituacao(conta.situacao)}
        />
        <dl className={estilos.ficha}>
          <div><dt>Situação</dt><dd><SeloSituacao tom={tomDaSituacao(conta.situacao)} rotulo={NOMES_SITUACAO_PAGAR[conta.situacao]} /></dd></div>
          <div><dt>Vencimento</dt><dd>{formatarDataBrasileira(conta.dataVencimento)}</dd></div>
          <div><dt>Valor original</dt><dd className="numero-tabular">{formatarDinheiro(conta.valorOriginal)}</dd></div>
          <div><dt>Já pago</dt><dd className="numero-tabular">{formatarDinheiro(conta.valorPago)}</dd></div>
          {conta.valorCancelado.ehPositivo() ? (
            <div><dt>Cancelado</dt><dd className="numero-tabular">{formatarDinheiro(conta.valorCancelado)}</dd></div>
          ) : null}
          <div><dt>Fornecedor</dt><dd>{conta.fornecedorNome}</dd></div>
          <div><dt>Categoria</dt><dd>{conta.categoriaNome}</dd></div>
        </dl>
      </div>

      {parcelada ? (
        <>
          <TituloSecao
            titulo="Parcelas desta conta"
            explicacao={`${conta.quantidadeParcelas} parcelas · ainda em aberto ${formatarDinheiro(saldoDoTitulo)}`}
          />
          <table className={estilos.parcelas}>
            <caption className="apenas-leitor-de-tela">Parcelas do título {conta.codigo}</caption>
            <thead>
              <tr>
                <th scope="col">Parcela</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Valor</th>
                <th scope="col">Pago</th>
                <th scope="col">Saldo</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {conta.parcelas.map((parcela) => (
                <tr key={parcela.parcelaId} className={parcela.parcelaId === conta.parcelaId ? estilos.parcelaAtual : undefined}>
                  <td data-rotulo="Parcela">
                    {parcela.parcelaId === conta.parcelaId ? (
                      <strong>{parcela.numeroParcela}/{conta.quantidadeParcelas} (esta)</strong>
                    ) : (
                      <Link href={`/contas-pagar/${parcela.parcelaId}`}>
                        {parcela.numeroParcela}/{conta.quantidadeParcelas}
                      </Link>
                    )}
                  </td>
                  <td data-rotulo="Vencimento">{formatarDataBrasileira(parcela.dataVencimento)}</td>
                  <td className={estilos.numeros} data-rotulo="Valor">{formatarDinheiro(parcela.valorOriginal)}</td>
                  <td className={estilos.numeros} data-rotulo="Pago">{formatarDinheiro(parcela.valorPago)}</td>
                  <td className={estilos.numeros} data-rotulo="Saldo">{formatarDinheiro(parcela.saldo)}</td>
                  <td data-rotulo="Situação">
                    <SeloSituacao tom={tomDaSituacao(parcela.situacao)} rotulo={NOMES_SITUACAO_PAGAR[parcela.situacao]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <TituloSecao titulo="Pagamentos" />
      {conta.pagamentos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum pagamento registrado"
          explicacao="Quando você registrar um pagamento, ele aparece aqui com data, valor e a conta de onde o dinheiro saiu."
        />
      ) : (
        <ul className={estilos.baixas}>
          {conta.pagamentos.map((p) => (
            <li key={p.id} className={`${estilos.baixa} ${p.estornado ? estilos.baixaEstornada : ""}`}>
              <div className={estilos.baixaTexto}>
                <span className={estilos.baixaValor}>
                  {formatarDinheiro(p.valorPago)}
                  {p.estornado ? <> <SeloSituacao tom="neutro" rotulo="Estornado" /></> : null}
                </span>
                <span className={estilos.baixaDetalhe}>
                  {formatarDataBrasileira(p.dataPagamento)} · {p.contaBancariaNome} ·{" "}
                  {NOMES_FORMA_PAGAMENTO[p.formaPagamento as FormaDePagamento] ?? p.formaPagamento}
                </span>
                <span className={estilos.baixaDetalhe}>
                  {[
                    `abateu ${formatarDinheiro(p.valorAbatido)} do saldo`,
                    p.valorJuros.ehPositivo() ? `juros ${formatarDinheiro(p.valorJuros)}` : null,
                    p.valorMulta.ehPositivo() ? `multa ${formatarDinheiro(p.valorMulta)}` : null,
                    p.valorDesconto.ehPositivo() ? `desconto ${formatarDinheiro(p.valorDesconto)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {p.estornado && p.motivoEstorno ? (
                  <span className={estilos.baixaMotivo}>Estornado: {p.motivoEstorno}</span>
                ) : null}
              </div>

              {podePagar && !p.estornado ? (
                <div className={estilos.baixaAcao}>
                  {p.podeEstornar ? (
                    <BotaoEstornar
                      pagamento={{
                        pagamentoId: p.id,
                        parcelaId: conta.parcelaId,
                        valorFormatado: formatarDinheiro(p.valorPago),
                        contaBancariaNome: p.contaBancariaNome,
                        dataFormatada: formatarDataBrasileira(p.dataPagamento),
                        abatidoFormatado: formatarDinheiro(p.valorAbatido),
                      }}
                    />
                  ) : (
                    <span className={estilos.baixaDetalhe}>Conciliado — desfaça a conciliação para estornar.</span>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <TituloSecao titulo="Registrar pagamento" />
      {conta.tituloCancelado ? (
        <Aviso tom="atencao" titulo="Conta cancelada">
          Não é possível registrar pagamento numa conta cancelada.
        </Aviso>
      ) : !emAberto ? (
        <Aviso tom="sucesso" titulo="Esta conta não tem saldo em aberto">
          Não há mais nada a pagar nesta conta.
        </Aviso>
      ) : !podePagar ? (
        <Aviso tom="informacao" titulo="Você não tem permissão para registrar pagamentos">
          Seu perfil nesta empresa permite consultar, mas não movimentar dinheiro. Peça a quem administra a empresa.
        </Aviso>
      ) : contas.length === 0 ? (
        <Aviso
          tom="informacao"
          titulo="Cadastre uma conta bancária antes"
          acao={<Link className="acao-primaria" href="/bancos">Ir para Bancos e caixa</Link>}
        >
          Todo pagamento sai de uma conta e vira um lançamento no extrato — por isso é preciso ter ao menos uma conta cadastrada.
        </Aviso>
      ) : (
        <FormularioPagamento
          conta={{
            parcelaId: conta.parcelaId,
            descricao: conta.descricao,
            saldoFormatado: formatarDinheiro(conta.saldo),
            saldoCanonico: conta.saldo.paraTexto(),
            contas: contas.map((c) => ({ id: c.id, nome: c.nome, saldoFormatado: formatarDinheiro(c.saldoAtual) })),
            hoje,
          }}
        />
      )}

      {podeCancelar && !conta.tituloCancelado ? (
        <FormularioCancelamento
          conta={{
            tituloId: conta.tituloId,
            parcelaId: conta.parcelaId,
            descricao: conta.descricao,
            saldoFormatado: formatarDinheiro(saldoDoTitulo),
            temBaixa: conta.tituloTemBaixaAtiva,
            parcelasEmAberto: conta.parcelas.filter((p) => p.situacao !== "liquidada" && p.situacao !== "cancelada").length,
          }}
        />
      ) : null}
    </>
  );
}
