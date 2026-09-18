import { afterEach, describe, expect, it } from "vitest";

import { limparCacheVariaveisAmbiente, obterVariaveisAmbiente } from "./variaveis-ambiente";

const minimo = {
  BANCO_URL: "postgres://financeiro_aplicacao:senha@localhost:5432/financeiro",
  APLICACAO_URL: "http://localhost:3000",
  APLICACAO_SEGREDO: "x".repeat(32),
};

describe("variaveis de ambiente", () => {
  afterEach(() => limparCacheVariaveisAmbiente());

  it("aceita a configuracao minima e aplica padroes", () => {
    const variaveis = obterVariaveisAmbiente(minimo);
    expect(variaveis.AMBIENTE).toBe("desenvolvimento");
    expect(variaveis.IA_PROVEDOR).toBe("desligado");
    expect(variaveis.BANCO_MAXIMO_CONEXOES).toBe(10);
  });

  it("falha com mensagem clara quando algo obrigatorio falta", () => {
    expect(() => obterVariaveisAmbiente({ APLICACAO_URL: "http://localhost:3000" })).toThrow(/BANCO_URL/);
    expect(() => obterVariaveisAmbiente({ ...minimo, APLICACAO_SEGREDO: "curto" })).toThrow(/APLICACAO_SEGREDO/);
  });
});
