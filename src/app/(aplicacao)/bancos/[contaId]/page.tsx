import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { Paginador, paginaDaUrl, TAMANHO_DA_PAGINA } from "../../_apoio/paginador";
import { NOMES_TIPO_CONTA } from "../tipos-de-conta";
import { FormularioAjusteDeSaldo } from "./formulario-ajuste";
import { FormularioEdicaoConta } from "./formulario-edicao";
import estilos from "./extrato.module.css";

export const metadata: Metadata = { title: "Extrato da conta" };

const NOMES_ORIGEM: Record<string, string> = {
  pagamento: "Pagamento",
  recebimento: "Recebimento",
  pagamento_divida: "Pagamento de dívida",
  transferencia: "Transferência",
  estorno: "Estorno",
  ajuste_manual: "Ajuste de saldo",
  extrato: "Importado do extrato",
};

/**
 * Extrato de uma conta bancaria: o que entrou, o que saiu e o saldo linha a
 * linha, em ordem de data.
 *
 * Nao e conciliacao — nada aqui e comparado com o arquivo do banco. E a visao
 * do que o SISTEMA registrou, que e o que permite conferir o saldo e achar o
 * lancamento errado antes de corrigi-lo.
 *
 * O saldo acumulado vem do banco de dados (funcao de janela), nao somado na
 * tela: com paginacao, somar aqui faria a pagina 2 comecar do zero.
 */
export default async function PaginaExtratoConta({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contaId } = await params;
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("bancos.visualizar", `/bancos/${contaId}`);
  const pagina = paginaDaUrl((await searchParams).pagina);

  const bancos = repositorios.bancos();
  const conta = await bancos.buscarPorId(escopo, contaId);
  if (!conta) notFound();

  const extrato = await bancos.extrato(escopo, contaId, { pagina, tamanho: TAMANHO_DA_PAGINA });
  const podeEditar = permissoes.has("bancos.editar");

  return (
    <>
      <CabecalhoPagina
        titulo={conta.nome}
        descricao={`${NOMES_TIPO_CONTA[conta.tipo] ?? conta.tipo}${conta.instituicaoNome ? ` · ${conta.instituicaoNome}` : ""}`}
        acoesSecundarias={<Link className="acao-secundaria" href="/bancos">Voltar para Bancos e caixa</Link>}
      />

      <div className={estilos.resumo}>
        <CartaoResumo
          titulo="Saldo atual"
          valor={<ValorFinanceiro valor={conta.saldoAtual.paraTexto()} tamanho="destaque" />}
          explicacao={`Saldo inicial de ${formatarDinheiro(conta.saldoInicial)} em ${formatarDataBrasileira(conta.dataSaldoInicial)}, mais as movimentações.`}
          contagem={`${extrato.total} ${extrato.total === 1 ? "lançamento" : "lançamentos"}`}
        />
      </div>

      <TituloSecao titulo="Extrato" explicacao="Em ordem de data, com o saldo da conta depois de cada lançamento." />

      {extrato.itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum lançamento nesta conta"
          explicacao="Os lançamentos aparecem aqui quando você registra pagamentos, recebimentos ou ajustes de saldo."
        />
      ) : (
        <>
          <table className={estilos.extrato}>
            <caption className="apenas-leitor-de-tela">Extrato da conta {conta.nome}</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Lançamento</th>
                <th scope="col">Origem</th>
                <th scope="col">Entrada</th>
                <th scope="col">Saída</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {extrato.itens.map((linha) => (
                <tr key={linha.id}>
                  <td data-rotulo="Data">{formatarDataBrasileira(linha.data)}</td>
                  <td data-rotulo="Lançamento">
                    {linha.descricao}
                    {linha.observacoes ? <span className={estilos.observacao}>{linha.observacoes}</span> : null}
                  </td>
                  <td data-rotulo="Origem">
                    <SeloSituacao
                      tom={linha.ehEstorno ? "atencao" : "neutro"}
                      rotulo={NOMES_ORIGEM[linha.origem] ?? linha.origem}
                    />
                  </td>
                  <td className={`${estilos.numeros} ${estilos.entrada}`} data-rotulo="Entrada">
                    {linha.tipo === "entrada" ? formatarDinheiro(linha.valor) : "—"}
                  </td>
                  <td className={`${estilos.numeros} ${estilos.saida}`} data-rotulo="Saída">
                    {linha.tipo === "saida" ? formatarDinheiro(linha.valor) : "—"}
                  </td>
                  <td className={estilos.numeros} data-rotulo="Saldo">{formatarDinheiro(linha.saldoAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Paginador
            rota={`/bancos/${contaId}`}
            parametros={{}}
            pagina={extrato.pagina}
            tamanho={extrato.tamanho}
            total={extrato.total}
            nomeSingular="lançamento"
            nomePlural="lançamentos"
          />
        </>
      )}

      {podeEditar ? (
        <>
          <TituloSecao
            titulo="Corrigir o saldo"
            explicacao={
              conta.saldoInicialEditavel
                ? "Esta conta ainda não tem movimentação, então o saldo inicial pode ser corrigido diretamente."
                : "Esta conta já tem movimentação. A correção é feita por lançamento de ajuste, que fica visível no extrato."
            }
          />

          {conta.saldoInicialEditavel ? (
            <Aviso tom="informacao" titulo="Enquanto não houver lançamento, o saldo inicial ainda pode mudar">
              Depois do primeiro pagamento, recebimento ou ajuste, ele trava — é a base de todo o histórico de saldo.
            </Aviso>
          ) : (
            <FormularioAjusteDeSaldo
              conta={{
                contaId: conta.id,
                nome: conta.nome,
                saldoFormatado: formatarDinheiro(conta.saldoAtual),
                saldoCanonico: conta.saldoAtual.paraTexto(),
                hoje,
              }}
            />
          )}

          <TituloSecao titulo="Dados da conta" explicacao="Nome, tipo e identificação no banco." />
          <FormularioEdicaoConta
            conta={{
              contaId: conta.id,
              nome: conta.nome,
              tipo: conta.tipo,
              instituicaoNome: conta.instituicaoNome,
              agencia: conta.agencia,
              numeroConta: conta.numeroConta,
              saldoInicialCanonico: conta.saldoInicial.paraTexto(),
              saldoInicialFormatado: formatarDinheiro(conta.saldoInicial),
              dataSaldoInicial: conta.dataSaldoInicial,
              saldoInicialEditavel: conta.saldoInicialEditavel,
            }}
          />
        </>
      ) : null}
    </>
  );
}
