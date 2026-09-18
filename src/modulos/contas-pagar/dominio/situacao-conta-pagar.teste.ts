import { describe, expect, it } from "vitest";

import { podeTransitar, SITUACOES_CONTA_PAGAR, TRANSICOES_PERMITIDAS } from "./situacao-conta-pagar";

describe("situacoes de conta a pagar", () => {
  it("permite o fluxo principal rascunho -> pendente -> paga", () => {
    expect(podeTransitar("rascunho", "pendente")).toBe(true);
    expect(podeTransitar("pendente", "paga")).toBe(true);
  });

  it("permite desfazer pagamento, mas nunca sair de cancelada", () => {
    expect(podeTransitar("paga", "pendente")).toBe(true);
    for (const situacao of SITUACOES_CONTA_PAGAR) {
      expect(podeTransitar("cancelada", situacao)).toBe(false);
    }
  });

  it("nao permite pagar rascunho nem pular a aprovacao", () => {
    expect(podeTransitar("rascunho", "paga")).toBe(false);
    expect(podeTransitar("aguardando_aprovacao", "paga")).toBe(false);
  });

  it("toda situacao tem transicoes definidas", () => {
    for (const situacao of SITUACOES_CONTA_PAGAR) {
      expect(Array.isArray(TRANSICOES_PERMITIDAS[situacao])).toBe(true);
    }
  });
});
