import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ArmazenamentoArquivosLocal } from "./armazenamento-arquivos-local";

describe("ArmazenamentoArquivosLocal", () => {
  let raiz = "";

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), "financeiro-arquivos-"));
  });

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("guarda, calcula a impressao digital, recupera e remove", async () => {
    const armazenamento = new ArmazenamentoArquivosLocal(raiz, "empresa-1");
    const conteudo = new TextEncoder().encode("boleto de teste");
    const guardado = await armazenamento.guardar({
      nomeOriginal: "../../boleto.pdf",
      tipoConteudo: "application/pdf",
      tamanhoBytes: conteudo.byteLength,
      conteudo,
    });
    expect(guardado.chave.startsWith("empresa-1/")).toBe(true);
    expect(guardado.chave).not.toContain("boleto");
    expect(guardado.impressaoDigital).toMatch(/^[0-9a-f]{64}$/);
    expect(guardado.tamanhoBytes).toBe(conteudo.byteLength);

    const lido = await armazenamento.obter(guardado.chave);
    expect(lido && new TextDecoder().decode(lido)).toBe("boleto de teste");

    await armazenamento.remover(guardado.chave);
    expect(await armazenamento.obter(guardado.chave)).toBeNull();
  });

  it("rejeita chaves que tentam sair da raiz", async () => {
    const armazenamento = new ArmazenamentoArquivosLocal(raiz, "empresa-1");
    await expect(armazenamento.obter("../../../etc/passwd")).rejects.toThrow(/invalida/);
  });
});
