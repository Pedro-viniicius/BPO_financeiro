import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { montarZip, somaDeVerificacao } from "./zip";

/**
 * O ZIP e escrito a mao, sem dependencia. Entao o teste nao pode conferir o
 * arquivo com o mesmo codigo que o escreveu: isso so provaria que a funcao
 * concorda consigo mesma.
 *
 * Aqui ele e aberto por um descompactador DE VERDADE (`unzip` do sistema)
 * sempre que existir, o que testa CRC, tamanhos e diretorio central de uma vez.
 * Onde nao houver `unzip`, o teste cai para uma leitura independente dos
 * cabecalhos.
 */

function temUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("montarZip", () => {
  const arquivos = [
    { nome: "LEIAME.txt", conteudo: "Acentuação: ação, coração, ônus.\nSegunda linha.\n" },
    { nome: "dados/pessoas.csv", conteudo: "nome;documento\nJosé;11222333000181\n" },
    { nome: "binario.bin", conteudo: Buffer.from([0, 1, 2, 253, 254, 255]), comprimir: false },
  ];

  it.skipIf(!temUnzip())("gera um ZIP que o descompactador do sistema abre e confere", () => {
    const pasta = mkdtempSync(join(tmpdir(), "zip-teste-"));
    const caminho = join(pasta, "teste.zip");
    writeFileSync(caminho, montarZip(arquivos));

    // `-t` testa o CRC de cada entrada: e a conferencia que pega byte trocado.
    const teste = execFileSync("unzip", ["-t", caminho], { encoding: "utf8" });
    expect(teste).toContain("No errors detected");

    execFileSync("unzip", ["-o", "-q", caminho, "-d", pasta]);
    expect(readFileSync(join(pasta, "LEIAME.txt"), "utf8")).toContain("coração");
    expect(readFileSync(join(pasta, "dados", "pessoas.csv"), "utf8")).toContain("José");
    expect([...readFileSync(join(pasta, "binario.bin"))]).toEqual([0, 1, 2, 253, 254, 255]);
  });

  it("os cabecalhos e o conteudo batem, lidos de forma independente", () => {
    const zip = montarZip(arquivos);

    // Assinaturas obrigatorias do formato.
    expect(zip.readUInt32LE(0)).toBe(0x0403_4b50); // primeiro cabecalho local
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x0605_4b50); // fim do diretorio
    expect(zip.readUInt16LE(zip.length - 14)).toBe(arquivos.length);

    // Le a primeira entrada na mao e descomprime.
    const tamanhoNome = zip.readUInt16LE(26);
    const tamanhoComprimido = zip.readUInt32LE(18);
    const inicio = 30 + tamanhoNome;
    expect(zip.subarray(30, inicio).toString("utf8")).toBe("LEIAME.txt");
    expect(inflateRawSync(zip.subarray(inicio, inicio + tamanhoComprimido)).toString("utf8")).toContain("coração");
  });

  it("comprime o que compensa e respeita quem pediu para nao comprimir", () => {
    const repetitivo = "a".repeat(10_000);
    const comprimido = montarZip([{ nome: "a.txt", conteudo: repetitivo }]);
    const cru = montarZip([{ nome: "a.txt", conteudo: repetitivo, comprimir: false }]);

    expect(comprimido.length).toBeLessThan(cru.length / 5);
  });

  it("recusa mais arquivos do que o formato classico comporta", () => {
    const muitos = Array.from({ length: 65_536 }, (_, i) => ({ nome: `a${i}.txt`, conteudo: "x" }));
    expect(() => montarZip(muitos)).toThrow(/65535|65.535/);
  });

  it("a soma de verificacao muda quando o conteudo muda", () => {
    const a = somaDeVerificacao(montarZip([{ nome: "a.txt", conteudo: "um" }]));
    const b = somaDeVerificacao(montarZip([{ nome: "a.txt", conteudo: "dois" }]));
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it("gera o mesmo arquivo para a mesma entrada e a mesma hora", () => {
    const instante = new Date("2026-09-23T10:00:00");
    expect(montarZip(arquivos, instante).equals(montarZip(arquivos, instante))).toBe(true);
  });
});
