import { describe, expect, it } from "vitest";

import type { DataCivil } from "@/compartilhado/datas/indice";

import {
  dataCivilDoInstante, marcoDeRetencaoAprovado, marcoDeRetencaoArquivado, marcoDeRetencaoRejeitado,
  MotivoDeRejeicaoInvalido, normalizarMotivo, podeReabrir,
} from "./conferencia";

const d = (texto: string) => texto as DataCivil;

describe("retencao (art. 173, I, CTN)", () => {
  it("aprovado: 5 anos a partir de 1o de janeiro seguinte a data MAIS TARDIA entre as candidatas", () => {
    // Chave de nov/2025, competencia dez/2025, envio em jan/2026 -> a mais tardia e 2026 -> 1/1/2027 + 5 = 1/1/2032
    expect(marcoDeRetencaoAprovado([d("2025-11-15"), d("2025-12-01"), d("2026-01-10")])).toBe("2032-01-01");
    // Todas em 2026 -> 2032 tambem; uma so em 2024 -> 2030.
    expect(marcoDeRetencaoAprovado([d("2026-06-30")])).toBe("2032-01-01");
    expect(marcoDeRetencaoAprovado([d("2024-12-31")])).toBe("2030-01-01");
    expect(() => marcoDeRetencaoAprovado([])).toThrow();
  });

  it("rejeitado: 90 dias da rejeicao; arquivado: 1 ano do envio", () => {
    expect(marcoDeRetencaoRejeitado(d("2026-01-01"))).toBe("2026-04-01");
    expect(marcoDeRetencaoArquivado(d("2026-02-28"))).toBe("2027-02-28");
  });

  it("a data civil do envio sai do instante no fuso de Sao Paulo, nao em UTC", () => {
    // 23:30 em Sao Paulo de 24/09 e 02:30 UTC de 25/09: o envio foi no dia 24.
    expect(dataCivilDoInstante(new Date("2026-09-25T02:30:00Z"))).toBe("2026-09-24");
  });
});

describe("regras da conferencia", () => {
  it("o motivo da rejeicao e obrigatorio e limpo", () => {
    expect(normalizarMotivo("  ilegível, tire outra foto  ")).toBe("ilegível, tire outra foto");
    expect(() => normalizarMotivo("")).toThrow(MotivoDeRejeicaoInvalido);
    expect(() => normalizarMotivo("ok")).toThrow(MotivoDeRejeicaoInvalido);
    expect(() => normalizarMotivo("x".repeat(501))).toThrow(MotivoDeRejeicaoInvalido);
  });

  it("so rejeitado e arquivado reabrem; aprovado e pendente nao", () => {
    expect(podeReabrir("rejeitado")).toBe(true);
    expect(podeReabrir("arquivado_sem_conferencia")).toBe(true);
    expect(podeReabrir("aprovado")).toBe(false);
    expect(podeReabrir("pendente_conferencia")).toBe(false);
  });
});
