import type { Metadata } from "next";
import Link from "next/link";

import { partesDaData } from "@/compartilhado/datas/indice";
import { Aviso, CabecalhoPagina, EstadoVazio, TituloSecao } from "@/interface/componentes/indice";

import { formatarDinheiro } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { AtalhoDaLinha, FormularioBase, GradeDoOrcamento, type LinhaParaPlanejar } from "./formularios";
import estilos from "../orcamento.module.css";

export const metadata: Metadata = { title: "Planejar orçamento" };

const ROTULOS_DE_GRUPO: Record<string, string> = {
  receita_bruta: "Receita",
  deducao: "Dedução",
  custo: "Custo",
  despesa_operacional: "Despesa operacional",
  resultado_financeiro: "Financeira",
  nao_operacional: "Não operacional",
};

/**
 * A grade de planejamento: categoria x doze meses.
 *
 * Categorias do grupo `transferencia` nao aparecem — transferencia entre
 * contas proprias e ajuste de saldo nao sao receita nem despesa, e orcar isso
 * nao quer dizer nada.
 */
export default async function PaginaPlanejarOrcamento({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje } = await exigirContextoFinanceiro("orcamento.editar", "/orcamento");
  const parametros = await searchParams;

  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const anoPedido = Number(texto("ano"));
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2000 && anoPedido <= 2200 ? anoPedido : partesDaData(hoje).ano;
  const aviso = texto("aviso");

  const planejamento = await repositorios.orcamento().planejamento(escopo, ano);
  const orcaveis = planejamento.linhas.filter((linha) => linha.natureza !== null);

  const paraOFormulario = (valor: { paraTexto: () => string; ehZero: () => boolean }) =>
    valor.ehZero() ? "" : valor.paraTexto().replace(".", ",");

  const linhas: LinhaParaPlanejar[] = orcaveis.map((linha) => ({
    categoriaId: linha.categoriaId,
    categoriaNome: linha.categoriaNome,
    grupoRotulo: ROTULOS_DE_GRUPO[linha.grupoDre ?? ""] ?? "Sem grupo",
    valores: linha.porMes.map(paraOFormulario),
    total: formatarDinheiro(linha.total),
  }));

  return (
    <>
      <CabecalhoPagina
        titulo={`Planejar ${ano}`}
        descricao="Quanto se espera de cada categoria, mês a mês"
        acoesSecundarias={<Link className="acao-secundaria" href={`/orcamento?ano=${ano}`}>Voltar para o acompanhamento</Link>}
      />

      {aviso ? <Aviso tom="sucesso" titulo={aviso} /> : null}

      {orcaveis.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma categoria para orçar"
          explicacao="O orçamento é por categoria financeira. Crie o plano de contas inicial em Cadastros para começar."
          acao={<Link className="acao-primaria" href="/cadastros#nova-categoria">Criar categorias</Link>}
        />
      ) : (
        <>
          <TituloSecao
            titulo="Começar de algum lugar"
            explicacao="Quase ninguém orça a partir de uma folha em branco. O que a empresa gastou no ano passado costuma ser a melhor estimativa do próximo."
          />
          <FormularioBase ano={ano} />

          <TituloSecao
            titulo="A grade do ano"
            explicacao={`Total planejado: ${formatarDinheiro(planejamento.total)}. Deixe em branco o que não for orçar — em branco é diferente de zero: só zero gera estouro a cada centavo gasto.`}
          />
          <GradeDoOrcamento ano={ano} linhas={linhas} />

          <TituloSecao
            titulo="Preencher uma categoria de uma vez"
            explicacao="Repetir põe o mesmo valor nos 12 meses. Distribuir divide um total anual, com os centavos que sobram na última parcela."
          />
          <div className={estilos.rolagem}>
            {orcaveis.map((linha) => (
              <AtalhoDaLinha
                key={linha.categoriaId}
                ano={ano}
                categoriaId={linha.categoriaId}
                categoriaNome={linha.categoriaNome}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
