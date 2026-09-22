import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dataCivilDeTexto, ehDataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { ESTRUTURA_DRE, NOMES_REGIME, REGIMES, type LinhaDre, type Regime } from "@/modulos/dre/publico";
import { CabecalhoPagina, EstadoVazio } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { TabelaSimples } from "../../_apoio/tabela-simples";

export const metadata: Metadata = { title: "Detalhe do resultado" };

/**
 * O que ha por tras de um numero do demonstrativo.
 *
 * Um total so merece confianca quando da para abrir. A soma dos lancamentos
 * listados aqui e EXATAMENTE o valor que estava na tela — ha teste de
 * integracao provando isso para todas as linhas, nos dois regimes.
 */
export default async function PaginaDetalheDoResultado({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo } = await exigirContextoFinanceiro("dre.visualizar", "/resultados");
  const parametros = await searchParams;

  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const de = texto("de");
  const ate = texto("ate");
  const linhaPedida = texto("linha");
  const definicao = ESTRUTURA_DRE.find((item) => item.linha === linhaPedida);
  if (!de || !ate || !ehDataCivil(de) || !ehDataCivil(ate) || !definicao) notFound();

  const regime = (REGIMES.includes(texto("regime") as Regime) ? texto("regime") : "caixa") as Regime;
  const conta = regime === "caixa" ? texto("conta") : undefined;
  const mes = texto("mes");
  const categoria = texto("categoria");

  const filtro = {
    de: dataCivilDeTexto(de),
    ate: dataCivilDeTexto(ate),
    regime,
    ...(conta ? { contaBancariaId: conta } : {}),
  };

  const lancamentos = await repositorios.resultados().lancamentosDaLinha(escopo, filtro, definicao.linha as LinhaDre, {
    ...(mes ? { competencia: mes } : {}),
    ...(categoria ? { categoriaNome: categoria } : {}),
  });

  const total = Dinheiro.somarTodos(lancamentos.map((item) => item.valor));
  const voltar = new URLSearchParams(
    Object.entries({ periodo: texto("periodo") ?? "personalizado", regime, de, ate, ...(conta ? { conta } : {}) }),
  );

  const recorte = [
    definicao.rotulo.replace(/^\(.\)\s*|^=\s*/u, ""),
    categoria ? `categoria ${categoria}` : null,
    mes ? `mês ${mes}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <CabecalhoPagina
        titulo={recorte}
        descricao={`${NOMES_REGIME[regime]} · ${formatarDataBrasileira(filtro.de)} a ${formatarDataBrasileira(filtro.ate)} · total ${formatarDinheiro(total)}`}
        acoesSecundarias={
          <Link className="acao-secundaria" href={`/resultados?${voltar.toString()}`}>Voltar para Resultados</Link>
        }
      />

      {lancamentos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum lançamento neste recorte"
          explicacao="Não há nada compondo este valor no período escolhido."
        />
      ) : (
        <TabelaSimples
          legenda={`Lançamentos de ${recorte}`}
          colunas={[
            { chave: "data", titulo: regime === "caixa" ? "Data da baixa" : "Competência" },
            { chave: "descricao", titulo: "Lançamento" },
            { chave: "pessoa", titulo: "Pessoa" },
            { chave: "categoria", titulo: "Categoria" },
            { chave: "origem", titulo: "Origem" },
            { chave: "valor", titulo: "Valor", alinhamento: "direita" },
          ]}
          linhas={lancamentos.map((item) => ({
            chave: item.id,
            celulas: {
              data: formatarDataBrasileira(item.data),
              descricao: { tipo: "link" as const, texto: item.descricao, rota: item.rota },
              pessoa: item.pessoaNome ?? "—",
              categoria: item.categoriaNome ?? "—",
              origem: {
                tipo: "selo" as const,
                rotulo: item.origem,
                tom: item.origem.startsWith("cancelada") ? ("atencao" as const) : ("neutro" as const),
              },
              valor: formatarDinheiro(item.valor),
            },
          }))}
        />
      )}
    </>
  );
}
