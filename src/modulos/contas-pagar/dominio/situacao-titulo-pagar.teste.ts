import { describe, expect, it } from "vitest";

import { situacaoTitulo } from "@/banco-dados/esquemas/enumeracoes";

import { NOMES_SITUACAO_TITULO, podeTransitar, SITUACOES_TITULO_PAGAR } from "./situacao-titulo-pagar";

describe("situacoes do titulo a pagar", () => {
  it("a lista do codigo e EXATAMENTE o enum do banco", () => {
    // Esta divergencia ja existiu: o esqueleto do Gate 2 dizia
    // "pendente/agendada/paga", valores que o banco nunca aceitou. O teste
    // existe para o codigo nao voltar a descrever um modelo que nao e o real.
    expect([...SITUACOES_TITULO_PAGAR]).toEqual([...situacaoTitulo.enumValues]);
  });

  it("toda situacao tem nome para exibir", () => {
    for (const situacao of SITUACOES_TITULO_PAGAR) {
      expect(NOMES_SITUACAO_TITULO[situacao]).toBeTruthy();
    }
  });

  it("nao existe situacao 'paga' no titulo: pagamento e fato da parcela", () => {
    expect(SITUACOES_TITULO_PAGAR).not.toContain("paga");
    expect(SITUACOES_TITULO_PAGAR).not.toContain("pago");
  });

  it("o fluxo normal vai de rascunho a aberto", () => {
    expect(podeTransitar("rascunho", "aberto")).toBe(true);
    expect(podeTransitar("aguardando_aprovacao", "aberto")).toBe(true);
  });

  it("cancelado e terminal", () => {
    for (const destino of SITUACOES_TITULO_PAGAR) {
      expect(podeTransitar("cancelado", destino)).toBe(false);
    }
  });

  it("titulo aberto so pode ser cancelado", () => {
    expect(podeTransitar("aberto", "cancelado")).toBe(true);
    expect(podeTransitar("aberto", "rascunho")).toBe(false);
  });
});
