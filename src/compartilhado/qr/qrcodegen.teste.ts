import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { qrcodegen } from "./qrcodegen";

/**
 * Guarda do codigo de terceiro incorporado (ADR-028).
 *
 * O arquivo e uma copia do `qrcodegen` do Project Nayuki com TRES
 * modificacoes locais declaradas no cabecalho. Este teste reconstroi o
 * original a partir da copia (tira o cabecalho, tira os `export`) e confere o
 * SHA-256 contra o da origem. Qualquer edicao alem das tres declaradas —
 * inclusive uma "melhoria" bem-intencionada — reprova aqui, e a pergunta
 * certa passa a ser "isso vai para o ADR ou volta?".
 */
const SHA256_DO_ORIGINAL = "1dc03fb5a10e0e2318ea162755bbdb9977ca6ce52cff959e9c9b6deafdccda9c";
const CAMINHO = "src/compartilhado/qr/qrcodegen.ts";

function reconstruirOriginal(copia: string): string {
  const fimDoCabecalhoLocal = copia.indexOf(" */\n") + " */\n".length;
  return copia
    .slice(fimDoCabecalhoLocal)
    .replace(/^export namespace /gm, "namespace ");
}

describe("qrcodegen incorporado (ADR-028)", () => {
  const copia = readFileSync(CAMINHO, "utf-8");

  it("mantem o aviso de licenca MIT e o titular, intactos", () => {
    expect(copia).toContain("Copyright (c) Project Nayuki. (MIT License)");
    expect(copia).toContain("Permission is hereby granted, free of charge");
  });

  it("declara as modificacoes locais no cabecalho", () => {
    expect(copia.startsWith("// @ts-nocheck\n")).toBe(true);
    expect(copia).toContain("MODIFICACOES LOCAIS");
  });

  it("fora as modificacoes declaradas, e byte a byte o arquivo da origem", () => {
    const hash = createHash("sha256").update(reconstruirOriginal(copia), "utf8").digest("hex");
    expect(hash).toBe(SHA256_DO_ORIGINAL);
  });

  /*
   * Vetor da norma ISO/IEC 18004, Anexo I: "01234567" em modo numerico,
   * versao 1, nivel M. Os 16 codewords de dados e os 10 de correcao sao os do
   * exemplo da norma. Testa o Reed-Solomon da biblioteca contra a referencia,
   * nao contra ela mesma.
   */
  it("reproduz os codewords de correcao do exemplo da norma (Anexo I)", () => {
    const dados = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    const esperado = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];
    const interno = qrcodegen.QrCode as unknown as {
      reedSolomonComputeDivisor(grau: number): number[];
      reedSolomonComputeRemainder(dados: readonly number[], divisor: readonly number[]): number[];
    };
    const divisor = interno.reedSolomonComputeDivisor(10);
    expect(interno.reedSolomonComputeRemainder(dados, divisor)).toEqual(esperado);
  });

  it("codifica o exemplo da norma como versao 1 (21x21)", () => {
    const qr = qrcodegen.QrCode.encodeSegments(
      [qrcodegen.QrSegment.makeNumeric("01234567")],
      qrcodegen.QrCode.Ecc.MEDIUM,
      1,
      40,
      -1,
      false,
    );
    expect(qr.version).toBe(1);
    expect(qr.size).toBe(21);
    expect(qr.errorCorrectionLevel).toBe(qrcodegen.QrCode.Ecc.MEDIUM);
  });
});
