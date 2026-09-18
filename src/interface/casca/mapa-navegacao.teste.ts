import { describe, expect, it } from "vitest";

import type { Permissao } from "@/nucleo/autorizacao/publico";

import { NAVEGACAO_PRINCIPAL, navegacaoVisivel, rotaAtiva } from "./mapa-navegacao";

describe("navegacaoVisivel", () => {
  it("esconde itens sem permissao e remove grupos que ficaram vazios", () => {
    const permissoes = new Set<Permissao>(["relatorios.visualizar", "contas_pagar.visualizar"]);
    const grupos = navegacaoVisivel(permissoes);
    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(["", "Operação"]);
    expect(grupos[1]?.itens.map((item) => item.rota)).toEqual(["/contas-pagar"]);
  });

  it("nao mostra nada para quem nao tem permissao alguma (negar por padrao)", () => {
    expect(navegacaoVisivel(new Set())).toEqual([]);
  });

  it("no maximo dois itens exibem contador", () => {
    const comContador = NAVEGACAO_PRINCIPAL.flatMap((grupo) => grupo.itens).filter((item) => item.aceitaContador);
    expect(comContador.length).toBeLessThanOrEqual(2);
  });
});

describe("rotaAtiva", () => {
  it("Inicio so e ativo na raiz exata", () => {
    expect(rotaAtiva("/", "/")).toBe(true);
    expect(rotaAtiva("/contas-pagar", "/")).toBe(false);
  });

  it("subrotas mantem o item pai ativo, sem confundir prefixos", () => {
    expect(rotaAtiva("/contas-pagar/CP-2026-000123", "/contas-pagar")).toBe(true);
    expect(rotaAtiva("/contas-pagar-x", "/contas-pagar")).toBe(false);
  });
});
