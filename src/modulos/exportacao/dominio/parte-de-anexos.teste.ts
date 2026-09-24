import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { montarParteDeAnexos, nomeNoPacote, ParteGrandeDemais, TETO_PARTE_ANEXOS_BYTES } from "./parte-de-anexos";

const anexo = (codigo: string, ordem: number, nome: string, texto: string) => {
  const conteudo = new TextEncoder().encode(texto);
  return { codigoDocumento: codigo, ordem, nomeOriginal: nome, tipoConteudo: "image/jpeg", tamanhoBytes: conteudo.byteLength, impressaoDigital: createHash("sha256").update(conteudo).digest("hex"), conteudo };
};

describe("parte mensal de anexos", () => {
  it("monta um ZIP com LEIAME, SOMAS-SHA256 e os arquivos SEM compressao (metodo 0)", () => {
    const a = anexo("DC-2026-000001", 0, "frente da nota.jpg", "x".repeat(2000));
    const { zip, quantidade, bytes } = montarParteDeAnexos("2026-09", "Nova Didata", [a]);
    expect(quantidade).toBe(1);
    expect(bytes).toBe(2000);
    const texto = zip.toString("latin1");
    expect(texto).toContain("LEIAME.txt");
    expect(texto).toContain("SOMAS-SHA256.txt");
    expect(texto).toContain("anexos/DC-2026-000001/01-frente_da_nota.jpg");
    // O cabecalho local do anexo tem metodo de compressao 0 (STORE): o conteudo aparece literal.
    expect(texto).toContain("x".repeat(2000));
    // As somas estao no formato do sha256sum -c
    expect(texto).toContain(`${a.impressaoDigital}  anexos/DC-2026-000001/01-frente_da_nota.jpg`);
  });

  it("nome no pacote nunca escapa da pasta do documento", () => {
    const perigoso = nomeNoPacote({ codigoDocumento: "DC-2026-000002", ordem: 1, nomeOriginal: "../../etc/passwd" });
    expect(perigoso).toBe("anexos/DC-2026-000002/02-_._etc_passwd");
    expect(perigoso.split("/")).toHaveLength(3);
    expect(perigoso).not.toContain("..");
    expect(nomeNoPacote({ codigoDocumento: "DC-2026-000002", ordem: 0, nomeOriginal: "nota ção.PDF" })).toBe("anexos/DC-2026-000002/01-nota_cao.PDF");
  });

  it("um mes acima do teto e recusado com mensagem em portugues, nao com pacote quebrado", () => {
    const grande = { ...anexo("DC-2026-000003", 0, "g.jpg", "g"), conteudo: new Uint8Array(TETO_PARTE_ANEXOS_BYTES + 1) };
    expect(() => montarParteDeAnexos("2026-09", "Nova Didata", [grande])).toThrow(ParteGrandeDemais);
    expect(() => montarParteDeAnexos("2026-09", "Nova Didata", [grande])).toThrow(/acima do teto de 512 MB/);
  });
});
