import { describe, expect, it } from "vitest";

import { linhaDoLancamento, type GrupoDre, type LinhaDre } from "@/modulos/dre/publico";

import { PLANO_PADRAO } from "./plano-padrao";

/**
 * O plano padrao precisa cobrir TODAS as linhas do demonstrativo que nascem
 * de categoria.
 *
 * Uma linha sem nenhuma categoria possivel e uma linha que nunca recebe
 * valor. O usuario nao tem como classificar um custo se nao existe categoria
 * de custo — e o resultado sai errado em silencio, porque a linha aparece
 * zerada como se realmente nao houvesse custo nenhum.
 *
 * Duas linhas ficam de fora, e o teste diz por que: `descontos_concedidos` e
 * `descontos_obtidos` vem das BAIXAS (o desconto dado ou obtido no
 * pagamento), nao de classificacao. Nenhuma conta do plano as alimenta.
 */

const LINHAS_QUE_NAO_VEM_DE_CATEGORIA: readonly LinhaDre[] = ["descontos_concedidos", "descontos_obtidos"];

/** Subtotais: calculados a partir das outras linhas, nunca lancados. */
const SUBTOTAIS: readonly LinhaDre[] = [
  "receita_liquida",
  "resultado_operacional",
  "resultado_periodo",
];

const TODAS_AS_LINHAS: readonly LinhaDre[] = [
  "receita_bruta",
  "deducoes",
  "descontos_concedidos",
  "receita_liquida",
  "custos",
  "despesas_operacionais",
  "resultado_operacional",
  "receitas_financeiras",
  "despesas_financeiras",
  "descontos_obtidos",
  "nao_operacional",
  "resultado_periodo",
];

describe("plano de contas padrao", () => {
  it("cobre todas as linhas do demonstrativo que vem de categoria", () => {
    const alcancadas = new Set<LinhaDre>();
    for (const conta of PLANO_PADRAO) {
      // O grupo `resultado_financeiro` alimenta duas linhas, conforme o
      // SENTIDO do lancamento; por isso os dois sentidos sao considerados.
      for (const tipo of ["entrada", "saida"] as const) {
        const linha = linhaDoLancamento(conta.grupoDre as GrupoDre, tipo);
        if (linha) alcancadas.add(linha);
      }
    }

    const esperadas = TODAS_AS_LINHAS.filter(
      (linha) => !LINHAS_QUE_NAO_VEM_DE_CATEGORIA.includes(linha) && !SUBTOTAIS.includes(linha),
    );
    const faltando = esperadas.filter((linha) => !alcancadas.has(linha));

    expect(faltando, `Linhas do DRE sem nenhuma categoria no plano padrao: ${faltando.join(", ")}`).toEqual([]);
  });

  it("toda conta tem pelo menos uma categoria: conta sem categoria nao classifica nada", () => {
    const vazias = PLANO_PADRAO.filter((conta) => conta.categorias.length === 0).map((c) => c.codigo);
    expect(vazias).toEqual([]);
  });

  it("codigos e nomes de categoria sao unicos", () => {
    const codigos = PLANO_PADRAO.map((conta) => conta.codigo);
    expect(new Set(codigos).size, `Codigos repetidos em ${codigos.join(", ")}`).toBe(codigos.length);

    const categorias = PLANO_PADRAO.flatMap((conta) => conta.categorias);
    const repetidas = categorias.filter((nome, i) => categorias.indexOf(nome) !== i);
    // O banco tem indice unico por (empresa, nome): repetir aqui faria a
    // semente falhar na metade, deixando o plano incompleto.
    expect(repetidas, `Categorias repetidas: ${repetidas.join(", ")}`).toEqual([]);
  });

  it("os codigos seguem o formato aceito pelo banco", () => {
    // CHECK `verifica_contas_plano_codigo`: ^[0-9]+(\.[0-9]+)*$
    const invalidos = PLANO_PADRAO.filter((conta) => !/^[0-9]+(\.[0-9]+)*$/.test(conta.codigo));
    expect(invalidos.map((c) => c.codigo)).toEqual([]);
  });
});
