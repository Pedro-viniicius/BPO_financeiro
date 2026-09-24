import { describe, expect, it } from "vitest";

import { PAPEIS, PERMISSOES_POR_PAPEL, type Papel } from "./papeis";
import { PERMISSOES, type Permissao } from "./permissoes";

/**
 * Fixa o conjunto EXATO de permissoes de cada papel.
 *
 * O motivo e um mecanismo de `papeis.ts`: tres papeis sao montados por filtro
 * automatico (`endsWith(".visualizar")`), e o administrador recebe o catalogo
 * inteiro. Entao acrescentar uma permissao ao catalogo concede acesso a
 * quatro papeis SEM que ninguem tenha decidido isso. Foi assim que
 * `captura.visualizar` quase chegou a `somente_leitura` no Gate 10.
 *
 * Com as listas abaixo, qualquer permissao nova quebra o build ate alguem
 * decidir, papel por papel, quem a recebe — e registrar a decisao aqui.
 */
const ESPERADO: Record<Papel, readonly Permissao[]> = {
  administrador: [...PERMISSOES], // recebe TUDO; a lista do catalogo e fixada logo abaixo
  financeiro: [
    "bancos.conciliar",
    "bancos.importar_extrato",
    "bancos.visualizar",
    "cadastros.editar",
    "cadastros.visualizar",
    "caixa.movimentar",
    "caixa.visualizar",
    "captura.conferir",
    "captura.visualizar",
    "cobranca.registrar_contato",
    "cobranca.renegociar",
    "cobranca.visualizar",
    "contas_pagar.cancelar",
    "contas_pagar.criar",
    "contas_pagar.editar",
    "contas_pagar.pagar",
    "contas_pagar.visualizar",
    "contas_receber.baixar",
    "contas_receber.cancelar",
    "contas_receber.criar",
    "contas_receber.editar",
    "contas_receber.visualizar",
    "exportacao.executar",
    "faturamento.emitir",
    "faturamento.visualizar",
    "fluxo_caixa.visualizar",
    "importacao.executar",
    "relatorios.visualizar",
  ],
  tesouraria: [
    "bancos.conciliar",
    "bancos.editar",
    "bancos.importar_extrato",
    "bancos.visualizar",
    "caixa.movimentar",
    "caixa.visualizar",
    "contas_pagar.aprovar",
    "contas_pagar.pagar",
    "contas_pagar.visualizar",
    "contas_receber.visualizar",
    "dividas.cancelar",
    "dividas.editar",
    "dividas.visualizar",
    "exportacao.executar",
    "fluxo_caixa.visualizar",
    "indicadores.visualizar",
    "previsao.editar_premissas",
    "previsao.visualizar",
    "relatorios.visualizar",
  ],
  controladoria: [
    "analises_ia.perguntar",
    "analises_ia.visualizar",
    "auditoria.visualizar",
    "bancos.visualizar",
    "cadastros.visualizar",
    "caixa.visualizar",
    "captura.visualizar",
    "centros_custo.editar",
    "centros_custo.visualizar",
    "cobranca.visualizar",
    "contas_pagar.visualizar",
    "contas_receber.visualizar",
    "dividas.visualizar",
    "dre.exportar",
    "dre.visualizar",
    "empresas.visualizar",
    "exportacao.executar",
    "faturamento.visualizar",
    "fluxo_caixa.visualizar",
    "indicadores.visualizar",
    "orcamento.editar",
    "orcamento.visualizar",
    "plano_contas.editar",
    "plano_contas.visualizar",
    "previsao.visualizar",
    "relatorios.visualizar",
    "usuarios.visualizar",
  ],
  auditor: [
    "analises_ia.visualizar",
    "auditoria.visualizar",
    "bancos.visualizar",
    "cadastros.visualizar",
    "caixa.visualizar",
    "captura.visualizar",
    "centros_custo.visualizar",
    "cobranca.visualizar",
    "contas_pagar.visualizar",
    "contas_receber.visualizar",
    "dividas.visualizar",
    "dre.exportar",
    "dre.visualizar",
    "empresas.visualizar",
    "exportacao.executar",
    "faturamento.visualizar",
    "fluxo_caixa.visualizar",
    "indicadores.visualizar",
    "orcamento.visualizar",
    "plano_contas.visualizar",
    "previsao.visualizar",
    "relatorios.visualizar",
    "usuarios.visualizar",
  ],
  somente_leitura: [
    "analises_ia.visualizar",
    "bancos.visualizar",
    "cadastros.visualizar",
    "caixa.visualizar",
    "centros_custo.visualizar",
    "cobranca.visualizar",
    "contas_pagar.visualizar",
    "contas_receber.visualizar",
    "dividas.visualizar",
    "dre.visualizar",
    "empresas.visualizar",
    "faturamento.visualizar",
    "fluxo_caixa.visualizar",
    "indicadores.visualizar",
    "orcamento.visualizar",
    "plano_contas.visualizar",
    "previsao.visualizar",
    "relatorios.visualizar",
  ],
};

/**
 * O catalogo inteiro, fixado. E esta lista que faz uma permissao NOVA quebrar
 * o build: ela precisa ser acrescentada aqui (o que obriga a abrir este
 * arquivo) e, junto, decidida em cada papel acima.
 */
const CATALOGO_FIXADO: readonly Permissao[] = [
  "analises_ia.perguntar",
  "analises_ia.visualizar",
  "auditoria.visualizar",
  "bancos.conciliar",
  "bancos.editar",
  "bancos.importar_extrato",
  "bancos.visualizar",
  "cadastros.editar",
  "cadastros.visualizar",
  "caixa.movimentar",
  "caixa.visualizar",
  "captura.conferir",
  "captura.gerenciar_qr",
  "captura.visualizar",
  "centros_custo.editar",
  "centros_custo.visualizar",
  "cobranca.registrar_contato",
  "cobranca.renegociar",
  "cobranca.visualizar",
  "configuracao.gerenciar",
  "contas_pagar.aprovar",
  "contas_pagar.cancelar",
  "contas_pagar.criar",
  "contas_pagar.editar",
  "contas_pagar.excluir",
  "contas_pagar.pagar",
  "contas_pagar.visualizar",
  "contas_receber.baixar",
  "contas_receber.cancelar",
  "contas_receber.criar",
  "contas_receber.editar",
  "contas_receber.excluir",
  "contas_receber.visualizar",
  "dividas.cancelar",
  "dividas.editar",
  "dividas.visualizar",
  "dre.exportar",
  "dre.visualizar",
  "empresas.gerenciar",
  "empresas.visualizar",
  "exportacao.executar",
  "faturamento.cancelar",
  "faturamento.emitir",
  "faturamento.visualizar",
  "fluxo_caixa.visualizar",
  "importacao.executar",
  "indicadores.visualizar",
  "integracoes.gerenciar",
  "lixeira.restaurar",
  "orcamento.editar",
  "orcamento.visualizar",
  "plano_contas.editar",
  "plano_contas.visualizar",
  "previsao.editar_premissas",
  "previsao.visualizar",
  "relatorios.visualizar",
  "usuarios.gerenciar",
  "usuarios.visualizar",
];

function ordenado(lista: Iterable<string>): string[] {
  return [...lista].sort();
}

describe("conjunto exato de permissoes por papel", () => {
  it("o catalogo e exatamente o fixado aqui — permissao nova exige decidir quem a recebe", () => {
    expect(ordenado(PERMISSOES)).toEqual(ordenado(CATALOGO_FIXADO));
  });

  it.each(PAPEIS)("%s tem exatamente as permissoes decididas", (papel) => {
    expect(ordenado(PERMISSOES_POR_PAPEL[papel])).toEqual(ordenado(ESPERADO[papel]));
  });

  it("as tres permissoes de captura foram atribuidas como decidido no Gate 10", () => {
    const quemTem = (permissao: Permissao) => PAPEIS.filter((papel) => PERMISSOES_POR_PAPEL[papel].has(permissao));
    expect(quemTem("captura.gerenciar_qr")).toEqual(["administrador"]);
    expect(quemTem("captura.conferir")).toEqual(["administrador", "financeiro"]);
    expect(quemTem("captura.visualizar")).toEqual(["administrador", "financeiro", "controladoria", "auditor"]);
  });
});
