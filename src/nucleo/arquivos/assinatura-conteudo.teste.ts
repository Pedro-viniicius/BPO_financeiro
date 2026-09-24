import { describe, expect, it } from "vitest";

import { detectarTipoPorConteudo } from "./assinatura-conteudo";

const bytes = (...valores: number[]) => new Uint8Array(valores);

describe("tipo pelo conteudo (ADR-032)", () => {
  it("reconhece JPEG, PNG e PDF pelas assinaturas", () => {
    expect(detectarTipoPorConteudo(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(detectarTipoPorConteudo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("image/png");
    expect(detectarTipoPorConteudo(new TextEncoder().encode("%PDF-1.7\n%âãÏÓ"))).toBe("application/pdf");
  });

  it("nao se deixa enganar por nome, cabecalho ou conteudo que so PARECE", () => {
    // Um executavel renomeado para .jpg comeca com "MZ".
    expect(detectarTipoPorConteudo(new TextEncoder().encode("MZ\x90\x00\x03"))).toBeNull();
    // HTML com script: nao e nenhum dos tres.
    expect(detectarTipoPorConteudo(new TextEncoder().encode("<html><script>"))).toBeNull();
    // PNG com um byte errado na assinatura.
    expect(detectarTipoPorConteudo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b))).toBeNull();
    // "%PDF" sem o hifen nao e a assinatura completa.
    expect(detectarTipoPorConteudo(new TextEncoder().encode("%PDF"))).toBeNull();
  });

  it("arquivo vazio ou curto demais nao tem tipo", () => {
    expect(detectarTipoPorConteudo(bytes())).toBeNull();
    expect(detectarTipoPorConteudo(bytes(0xff, 0xd8))).toBeNull();
  });
});
