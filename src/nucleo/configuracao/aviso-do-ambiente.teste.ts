import { describe, expect, it } from "vitest";

import { avisoDoAmbiente, type VariaveisAmbiente } from "./publico";

/**
 * A faixa de ambiente existe por um motivo so: impedir que alguem confunda a
 * vitrine com o sistema real e lance dado de verdade nela — num lugar onde
 * ninguem faz backup e que pode ser apagado a qualquer momento.
 *
 * Por isso os dois lados sao testados: que ela APARECE fora de producao, e
 * que ela NAO aparece em producao, onde viraria ruido diario.
 */

const comAmbiente = (ambiente: VariaveisAmbiente["AMBIENTE"]) =>
  avisoDoAmbiente({ AMBIENTE: ambiente } as VariaveisAmbiente);

describe("aviso do ambiente", () => {
  it("producao nao recebe faixa nenhuma", () => {
    expect(comAmbiente("producao")).toBeNull();
  });

  it.each(["demonstracao", "homologacao", "desenvolvimento"] as const)("%s recebe faixa", (ambiente) => {
    const aviso = comAmbiente(ambiente);
    expect(aviso).not.toBeNull();
    expect(aviso!.rotulo).toMatch(/Ambiente de/);
    expect(aviso!.explicacao.length).toBeGreaterThan(20);
  });

  it("a demonstracao diz, com todas as letras, para nao lancar dado real", () => {
    expect(comAmbiente("demonstracao")!.explicacao).toContain("Não lance informação real");
  });
});
