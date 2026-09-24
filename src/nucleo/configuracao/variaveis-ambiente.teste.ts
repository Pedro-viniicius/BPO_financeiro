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

  describe("AUDITORIA_SAL_IP (Gate 10)", () => {
    it("e tolerada ausente em desenvolvimento", () => {
      expect(obterVariaveisAmbiente(minimo).AUDITORIA_SAL_IP).toBeUndefined();
    });

    it.each(["producao", "demonstracao"])("e obrigatoria em %s: sem ela o boot falha", (ambiente) => {
      expect(() => obterVariaveisAmbiente({ ...minimo, AMBIENTE: ambiente })).toThrow(/AUDITORIA_SAL_IP e obrigatoria/);
    });

    it("recusa sal curto em qualquer ambiente", () => {
      expect(() => obterVariaveisAmbiente({ ...minimo, AUDITORIA_SAL_IP: "curto" })).toThrow(/32 caracteres/);
    });

    it("aceita sal de 32 caracteres em producao", () => {
      const variaveis = obterVariaveisAmbiente({ ...minimo, AMBIENTE: "producao", AUDITORIA_SAL_IP: "s".repeat(32) });
      expect(variaveis.AUDITORIA_SAL_IP).toHaveLength(32);
    });
  });
});
