import { describe, expect, it } from "vitest";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import { BOM_UTF8, campoCsv, montarCsvDoResultado, nomeDoArquivoCsv, numeroParaPlanilha } from "./csv-do-resultado";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);

describe("numero para planilha", () => {
  it("usa virgula decimal e NAO usa separador de milhar nem simbolo", () => {
    expect(numeroParaPlanilha(reais("1.234,56"))).toBe("1234,56");
    expect(numeroParaPlanilha(reais("10,00"))).toBe("10,00");
    expect(numeroParaPlanilha(Dinheiro.zero())).toBe("0,00");
  });

  it("preserva o sinal do prejuizo", () => {
    expect(numeroParaPlanilha(reais("-500,00"))).toBe("-500,00");
  });
});

describe("campo de texto", () => {
  it("texto simples passa direto", () => {
    expect(campoCsv("Receita bruta")).toBe("Receita bruta");
  });

  it("texto com ponto e virgula ganha aspas, senao viraria duas celulas", () => {
    expect(campoCsv("Aluguel; sala 2")).toBe('"Aluguel; sala 2"');
  });

  it("aspa dentro do texto vira duas", () => {
    expect(campoCsv('Sala "A"')).toBe('"Sala ""A"""');
  });

  it("quebra de linha tambem e protegida", () => {
    expect(campoCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });
});

describe("arquivo completo", () => {
  const csv = montarCsvDoResultado(
    { empresa: "Nova Didata", regime: "Caixa", periodo: "01/09/2026 a 30/09/2026", meses: ["set/26"] },
    [
      {
        rotulo: "Receita bruta",
        porMes: [reais("13.000,00")],
        total: reais("13.000,00"),
        categorias: [{ categoriaNome: "Mensalidades", porMes: [reais("13.000,00")], total: reais("13.000,00") }],
      },
      { rotulo: "= Resultado do período", porMes: [reais("7.995,00")], total: reais("7.995,00") },
    ],
  );
  const linhas = csv.split("\r\n");

  it("comeca com BOM, senao o Excel quebra os acentos", () => {
    expect(csv.startsWith(BOM_UTF8)).toBe(true);
    expect(csv).toContain("Período");
  });

  it("identifica empresa, regime e periodo no topo", () => {
    expect(linhas[0]).toBe(`${BOM_UTF8}Empresa;Nova Didata`);
    expect(linhas[1]).toBe("Regime;Caixa");
    expect(linhas[2]).toBe("Período;01/09/2026 a 30/09/2026");
  });

  it("tem cabecalho de colunas com os meses e o total", () => {
    expect(linhas[4]).toBe("Linha;set/26;Total");
  });

  it("escreve as linhas com numero de planilha, nao texto formatado", () => {
    expect(linhas[5]).toBe("Receita bruta;13000,00;13000,00");
    expect(csv).not.toContain("R$");
  });

  it("recua as categorias sob a linha delas", () => {
    expect(linhas[6]).toBe("    Mensalidades;13000,00;13000,00");
  });

  it("termina com quebra de linha, para a ultima linha nao grudar", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("usa CRLF, que e o que o Excel espera", () => {
    expect(csv).toContain("\r\n");
  });
});

describe("nome do arquivo", () => {
  it("diz regime e periodo, para ser reconhecivel meses depois", () => {
    expect(nomeDoArquivoCsv("caixa", "2026-09-01", "2026-09-30")).toBe("resultados-caixa-2026-09-01-a-2026-09-30.csv");
  });
});
