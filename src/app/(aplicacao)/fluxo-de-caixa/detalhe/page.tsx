import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dataCivilDeTexto, ehDataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { CabecalhoPagina, EstadoVazio } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { TabelaSimples } from "../../_apoio/tabela-simples";

export const metadata: Metadata = { title: "Detalhe do período" };

const NOMES_ORIGEM: Record<string, string> = {
  pagamento: "Pagamento",
  recebimento: "Recebimento",
  pagamento_divida: "Pagamento de dívida",
  transferencia: "Transferência",
  estorno: "Estorno",
  ajuste_manual: "Ajuste de saldo",
  extrato: "Do extrato",
};

/**
 * O que ha por tras de um numero do fluxo de caixa.
 *
 * Um total so merece confianca quando da para abrir. Esta tela e a resposta a
 * "de onde saiu esse valor?": lista os lancamentos (realizado) ou as parcelas
 * (previsto) que formam o periodo, cada um com link para onde ele vive.
 */
export default async function PaginaDetalheDoFluxo({
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

  const de = texto("de");
  const ate = texto("ate");
  if (!de || !ate || !ehDataCivil(de) || !ehDataCivil(ate)) notFound();

  const inicio = dataCivilDeTexto(de);
  const fim = dataCivilDeTexto(ate);
  const previsto = texto("natureza") === "previsto";
  const contaEscolhida = texto("conta");

  const voltar = new URLSearchParams();
  if (contaEscolhida) voltar.set("conta", contaEscolhida);
  const rotaDeVolta = voltar.toString() ? `/fluxo-de-caixa?${voltar.toString()}` : "/fluxo-de-caixa";

  const periodo = `${formatarDataBrasileira(inicio)} a ${formatarDataBrasileira(fim)}`;

  if (previsto) {
    const parcelas = await repositorios.fluxoCaixa().parcelasDoPeriodo(escopo, inicio, fim, hoje);
    const aReceber = Dinheiro.somarTodos(parcelas.filter((p) => p.area === "receber").map((p) => p.saldo));
    const aPagar = Dinheiro.somarTodos(parcelas.filter((p) => p.area === "pagar").map((p) => p.saldo));

    return (
      <>
        <CabecalhoPagina
          titulo="Previsto no período"
          descricao={`${periodo} · a receber ${formatarDinheiro(aReceber)} · a pagar ${formatarDinheiro(aPagar)}`}
          acoesSecundarias={<Link className="acao-secundaria" href={rotaDeVolta}>Voltar para o fluxo</Link>}
        />

        {parcelas.length === 0 ? (
          <EstadoVazio titulo="Nada previsto neste período" explicacao="Não há parcelas em aberto vencendo aqui." />
        ) : (
          <TabelaSimples
            legenda="Parcelas previstas"
            colunas={[
              { chave: "vencimento", titulo: "Vencimento" },
              { chave: "descricao", titulo: "Conta" },
              { chave: "pessoa", titulo: "Pessoa" },
              { chave: "area", titulo: "Tipo" },
              { chave: "valor", titulo: "Valor", alinhamento: "direita" },
            ]}
            linhas={parcelas.map((parcela) => ({
              chave: parcela.parcelaId,
              celulas: {
                vencimento: formatarDataBrasileira(parcela.dataVencimento),
                descricao: { tipo: "link" as const, texto: `${parcela.codigo} · ${parcela.descricao}`, rota: parcela.rota },
                pessoa: parcela.pessoaNome,
                area: {
                  tipo: "selo" as const,
                  rotulo: parcela.area === "receber" ? "A receber" : "A pagar",
                  tom: parcela.area === "receber" ? ("sucesso" as const) : ("neutro" as const),
                },
                valor: formatarDinheiro(parcela.saldo),
              },
            }))}
          />
        )}
      </>
    );
  }

  const filtro = {
    de: inicio,
    ate: fim,
    granularidade: "dia" as const,
    ...(contaEscolhida ? { contaBancariaId: contaEscolhida } : {}),
  };
  const lancamentos = await repositorios.fluxoCaixa().lancamentosDoPeriodo(escopo, filtro, inicio, fim);
  const entradas = Dinheiro.somarTodos(lancamentos.filter((l) => l.tipo === "entrada").map((l) => l.valor));
  const saidas = Dinheiro.somarTodos(lancamentos.filter((l) => l.tipo === "saida").map((l) => l.valor));

  return (
    <>
      <CabecalhoPagina
        titulo="Realizado no período"
        descricao={`${periodo} · entrou ${formatarDinheiro(entradas)} · saiu ${formatarDinheiro(saidas)}`}
        acoesSecundarias={<Link className="acao-secundaria" href={rotaDeVolta}>Voltar para o fluxo</Link>}
      />

      {lancamentos.length === 0 ? (
        <EstadoVazio titulo="Nenhum lançamento neste período" explicacao="Nada entrou nem saiu das contas aqui." />
      ) : (
        <TabelaSimples
          legenda="Lançamentos do período"
          colunas={[
            { chave: "data", titulo: "Data" },
            { chave: "descricao", titulo: "Lançamento" },
            { chave: "conta", titulo: "Conta" },
            { chave: "categoria", titulo: "Categoria" },
            { chave: "origem", titulo: "Origem" },
            { chave: "entrada", titulo: "Entrada", alinhamento: "direita" },
            { chave: "saida", titulo: "Saída", alinhamento: "direita" },
          ]}
          linhas={lancamentos.map((lancamento) => ({
            chave: lancamento.id,
            celulas: {
              data: formatarDataBrasileira(lancamento.data),
              descricao: lancamento.descricao,
              conta: { tipo: "link" as const, texto: lancamento.contaBancariaNome, rota: lancamento.rota },
              categoria: lancamento.categoriaNome ?? "—",
              origem: {
                tipo: "selo" as const,
                rotulo: NOMES_ORIGEM[lancamento.origem] ?? lancamento.origem,
                tom: lancamento.origem === "estorno" ? ("atencao" as const) : ("neutro" as const),
              },
              entrada: lancamento.tipo === "entrada" ? formatarDinheiro(lancamento.valor) : "—",
              saida: lancamento.tipo === "saida" ? formatarDinheiro(lancamento.valor) : "—",
            },
          }))}
        />
      )}
    </>
  );
}
