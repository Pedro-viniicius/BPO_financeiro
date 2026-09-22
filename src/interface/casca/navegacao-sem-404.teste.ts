import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { estaDisponivel, NAVEGACAO_APOIO, NAVEGACAO_PRINCIPAL, type ItemDeMenu } from "./mapa-navegacao";

/**
 * Nenhum item clicavel pode terminar em 404.
 *
 * O mapa de navegacao mostra o produto inteiro, inclusive modulos que ainda
 * nao existem. Isso e proposital — esconde-los faria parecer que nunca vao
 * existir. O acordo e outro: quem esta no mapa ou TEM rota, ou esta marcado
 * como "em_breve" e nao navega.
 *
 * Este teste confere o acordo contra o disco. Ele falha nos dois sentidos:
 * item disponivel sem rota (404 esperando acontecer) e item marcado como
 * futuro cuja rota ja foi implementada (selo "Em breve" mentindo).
 */

const PASTA_ROTAS = "src/app/(aplicacao)";

const TODOS: readonly ItemDeMenu[] = [...NAVEGACAO_PRINCIPAL.flatMap((grupo) => grupo.itens), ...NAVEGACAO_APOIO];

/** `/contas-pagar` -> `src/app/(aplicacao)/contas-pagar/page.tsx` */
function rotaImplementada(rota: string): boolean {
  return existsSync(join(PASTA_ROTAS, rota.replace(/^\//, ""), "page.tsx"));
}

describe("navegacao sem 404", () => {
  it("todo item disponivel tem pagina no disco", () => {
    const quebrados = TODOS.filter(estaDisponivel)
      .filter((item) => !rotaImplementada(item.rota))
      .map((item) => `${item.rotulo} -> ${item.rota}`);

    expect(
      quebrados,
      "Item de menu clicavel sem pagina correspondente: leva o usuario a 404. " +
        "Ou crie a rota, ou marque o item com `disponibilidade: \"em_breve\"`.",
    ).toEqual([]);
  });

  it("nenhum item marcado como 'em breve' ja tem rota pronta", () => {
    const desatualizados = TODOS.filter((item) => !estaDisponivel(item))
      .filter((item) => rotaImplementada(item.rota))
      .map((item) => `${item.rotulo} -> ${item.rota}`);

    expect(
      desatualizados,
      "A rota existe, mas o menu ainda diz 'Em breve' e nao deixa clicar. " +
        "Remova `disponibilidade: \"em_breve\"` do item.",
    ).toEqual([]);
  });

  it("a propria varredura funciona (nao passa vazio por engano)", () => {
    expect(TODOS.length).toBeGreaterThan(5);
    expect(TODOS.some(estaDisponivel)).toBe(true);
    expect(rotaImplementada("/inicio")).toBe(true);
    expect(rotaImplementada("/rota-que-nunca-existiu")).toBe(false);
  });
});
