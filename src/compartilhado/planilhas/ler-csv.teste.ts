import { describe, expect, it } from "vitest";

import { lerCsv, normalizarCabecalho } from "./ler-csv";

describe("lerCsv", () => {
  it("le o formato que o Excel em portugues grava: BOM, ponto e virgula, CRLF", () => {
    const planilha = lerCsv("﻿Nome;Documento\r\nJosé;11222333000181\r\n");

    expect(planilha.separador).toBe(";");
    expect(planilha.cabecalhos).toEqual(["nome", "documento"]);
    expect(planilha.linhas).toHaveLength(1);
    expect(planilha.linhas[0]!.campos.nome).toBe("José");
  });

  it("descobre a virgula quando o arquivo vem de outra ferramenta", () => {
    const planilha = lerCsv("Nome,Documento\nMaria,123\n");
    expect(planilha.separador).toBe(",");
    expect(planilha.linhas[0]!.campos.documento).toBe("123");
  });

  it("respeita aspas: separador, aspas e quebra de linha DENTRO do campo", () => {
    const planilha = lerCsv('Nome;Observação\n"Silva; Souza e Cia";"Disse ""urgente"" e pediu\nresposta hoje"\n');

    expect(planilha.linhas[0]!.campos.nome).toBe("Silva; Souza e Cia");
    expect(planilha.linhas[0]!.campos["observacao"]).toBe('Disse "urgente" e pediu\nresposta hoje');
  });

  it("o numero da linha e o do ARQUIVO, que e o que a pessoa ve no Excel", () => {
    const planilha = lerCsv("Nome\nA\nB\nC\n");
    expect(planilha.linhas.map((l) => l.numero)).toEqual([2, 3, 4]);
  });

  it("pula linha totalmente em branco sem bagunçar a contagem", () => {
    const planilha = lerCsv("Nome\nA\n\nC\n");
    expect(planilha.linhas.map((l) => [l.numero, l.campos.nome])).toEqual([
      [2, "A"],
      [4, "C"],
    ]);
  });

  it("casa cabecalho com acento, maiuscula e espaco sobrando", () => {
    expect(normalizarCabecalho("  Data de   VENCIMENTO ")).toBe("data de vencimento");
    expect(normalizarCabecalho("Número")).toBe("numero");

    const planilha = lerCsv("Número da Parcela;VALOR\n1/3;100,00\n");
    expect(planilha.linhas[0]!.campos["numero da parcela"]).toBe("1/3");
  });

  it("preenche com vazio a coluna que a linha nao trouxe", () => {
    const planilha = lerCsv("a;b;c\n1;2\n");
    expect(planilha.linhas[0]!.campos.c).toBe("");
  });

  it("arquivo vazio nao e erro: devolve nada", () => {
    expect(lerCsv("").linhas).toEqual([]);
    expect(lerCsv("   \n").linhas).toEqual([]);
  });

  it("le a ultima linha mesmo sem quebra no fim", () => {
    expect(lerCsv("Nome\nSem quebra").linhas[0]!.campos.nome).toBe("Sem quebra");
  });
});
