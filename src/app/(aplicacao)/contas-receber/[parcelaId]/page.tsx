import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NOMES_SITUACAO_RECEBER } from "@/compartilhado/financeiro/indice";
import { Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, LinhaDoTempo, SeloSituacao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioRecebimento } from "./formulario-recebimento";
import estilos from "./detalhe.module.css";

export const metadata: Metadata = { title: "Conta a pagar" };

/**
 * Detalhe de uma conta a pagar: quanto era, quanto foi pago, quanto falta, e
 * o historico de cada recebimento.
 *
 * `buscarPorId` recebe o escopo da empresa junto com o id — saber o UUID de uma
 * conta de outra empresa nao abre nada, devolve `notFound()`.
 */
export default async function PaginaContaReceber({ params }: { params: Promise<{ parcelaId: string }> }) {
  const { parcelaId } = await params;
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("contas_receber.visualizar", `/contas-receber/${parcelaId}`);

  const conta = await repositorios.contasReceber().buscarPorId(escopo, parcelaId, hoje);
  if (!conta) notFound();

  const contas = await repositorios.bancos().listar(escopo);
  const podePagar = permissoes.has("contas_receber.baixar");
  const emAberto = conta.situacao !== "liquidada" && conta.situacao !== "cancelada";

  return (
    <>
      <CabecalhoPagina
        titulo={conta.descricao}
        descricao={`${conta.codigo} · ${conta.clienteNome}`}
        acoesSecundarias={<Link className="acao-secundaria" href="/contas-receber">Voltar para a lista</Link>}
      />

      <div className={estilos.resumo}>
        <CartaoResumo
          titulo="Quanto ainda falta receber"
          valor={<ValorFinanceiro valor={conta.saldo.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao={`De ${formatarDinheiro(conta.valorOriginal)}, já foram pagos ${formatarDinheiro(conta.valorRecebido)}.`}
          tom={tomDaSituacao(conta.situacao)}
        />
        <dl className={estilos.ficha}>
          <div><dt>Situação</dt><dd><SeloSituacao tom={tomDaSituacao(conta.situacao)} rotulo={NOMES_SITUACAO_RECEBER[conta.situacao]} /></dd></div>
          <div><dt>Vencimento</dt><dd>{formatarDataBrasileira(conta.dataVencimento)}</dd></div>
          <div><dt>Valor original</dt><dd className="numero-tabular">{formatarDinheiro(conta.valorOriginal)}</dd></div>
          <div><dt>Já recebido</dt><dd className="numero-tabular">{formatarDinheiro(conta.valorRecebido)}</dd></div>
          <div><dt>Cliente</dt><dd>{conta.clienteNome}</dd></div>
          <div><dt>Categoria</dt><dd>{conta.categoriaNome}</dd></div>
        </dl>
      </div>

      <h2>Recebimentos</h2>
      {conta.recebimentos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum recebimento registrado"
          explicacao="Quando você registrar um recebimento, ele aparece aqui com data, valor e a conta de onde o dinheiro saiu."
        />
      ) : (
        <LinhaDoTempo
          eventos={conta.recebimentos.map((p) => ({
            id: p.id,
            quando: formatarDataBrasileira(p.dataRecebimento),
            descricao: `${formatarDinheiro(p.valorRecebido)} · ${p.contaBancariaNome}`,
            detalhe: [
              `Abateu ${formatarDinheiro(p.valorPrincipal)} do saldo`,
              p.valorJuros.ehPositivo() ? `juros ${formatarDinheiro(p.valorJuros)}` : null,
              p.valorMulta.ehPositivo() ? `multa ${formatarDinheiro(p.valorMulta)}` : null,
              p.valorDesconto.ehPositivo() ? `desconto ${formatarDinheiro(p.valorDesconto)}` : null,
              p.estornado ? "ESTORNADO" : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      )}

      <h2>Registrar recebimento</h2>
      {!emAberto ? (
        <Aviso tom="sucesso" titulo="Esta conta não tem saldo em aberto">
          Não há mais nada a receber nesta conta.
        </Aviso>
      ) : !podePagar ? (
        <Aviso tom="informacao" titulo="Você não tem permissão para registrar recebimentos">
          Seu perfil nesta empresa permite consultar, mas não movimentar dinheiro. Peça a quem administra a empresa.
        </Aviso>
      ) : contas.length === 0 ? (
        <Aviso
          tom="informacao"
          titulo="Cadastre uma conta bancária antes"
          acao={<Link className="acao-primaria" href="/bancos">Ir para Bancos e caixa</Link>}
        >
          Todo recebimento entra em uma conta e vira um lançamento no extrato — por isso é preciso ter ao menos uma conta cadastrada.
        </Aviso>
      ) : (
        <FormularioRecebimento
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
    </>
  );
}
