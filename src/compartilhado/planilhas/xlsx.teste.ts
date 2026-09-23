import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { montarXlsx } from "./xlsx";

/**
 * O XLSX e escrito a mao. O teste confere o que da para conferir sem abrir o
 * Excel: que o pacote e um ZIP valido pelo descompactador do sistema, que as
 * partes obrigatorias estao la e que o XML de cada uma esta bem formado —
 * qualquer uma dessas tres faltando faz o Excel recusar o arquivo inteiro, sem
 * dizer o porque.
 */

function temFerramenta(nome: string, args: string[]): boolean {
  try {
    execFileSync(nome, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const abas = [
  {
    nome: "Pessoas",
    linhas: [
      ["Nome", "Documento", "Limite"],
      ["José da Silva & Cia", "11222333000181", 1500.5],
      ["Ação <teste>", "", 0],
    ],
    larguras: [40, 20, 12],
  },
  { nome: "Instruções", linhas: [["Como preencher"], ["Uma linha por pessoa."]] },
];

describe("montarXlsx", () => {
  it.skipIf(!temFerramenta("unzip", ["-v"]))("gera um pacote que o descompactador abre e confere", () => {
    const pasta = mkdtempSync(join(tmpdir(), "xlsx-teste-"));
    const caminho = join(pasta, "modelo.xlsx");
    writeFileSync(caminho, montarXlsx(abas));

    expect(execFileSync("unzip", ["-t", caminho], { encoding: "utf8" })).toContain("No errors detected");

    const lista = execFileSync("unzip", ["-l", caminho], { encoding: "utf8" });
    for (const parte of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      expect(lista, `faltou ${parte}`).toContain(parte);
    }

    const planilha = execFileSync("unzip", ["-p", caminho, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
    // Texto escapado, numero como numero.
    expect(planilha).toContain("José da Silva &amp; Cia");
    expect(planilha).toContain("A&#231;&#227;o &lt;teste&gt;".replace(/&#\d+;/g, (c) => String.fromCharCode(Number(c.slice(2, -1)))));
    expect(planilha).toContain("<v>1500.5</v>");
    // Cabecalho congelado: rolar sem perder os nomes das colunas.
    expect(planilha).toContain('state="frozen"');
  });

  it.skipIf(!temFerramenta("python3", ["-c", "import xml.dom.minidom"]))("todo XML do pacote esta bem formado", () => {
    const pasta = mkdtempSync(join(tmpdir(), "xlsx-xml-"));
    const caminho = join(pasta, "modelo.xlsx");
    writeFileSync(caminho, montarXlsx(abas));

    const script = `
import sys, zipfile, xml.dom.minidom
com = zipfile.ZipFile(sys.argv[1])
for nome in com.namelist():
    if nome.endswith(('.xml', '.rels')):
        xml.dom.minidom.parseString(com.read(nome))
print(len(com.namelist()))
`;
    const saida = execFileSync("python3", ["-c", script, caminho], { encoding: "utf8" });
    expect(Number(saida.trim())).toBe(7);
  });

  it("corta e limpa nome de aba que o formato nao aceita", () => {
    const pacote = montarXlsx([{ nome: "Relatório/2026: [dados] muito longo para caber no limite", linhas: [["a"]] }]);
    const texto = pacote.toString("latin1");
    expect(texto).not.toContain("Relatório/2026:");
  });

  it("recusa planilha sem aba nenhuma", () => {
    expect(() => montarXlsx([])).toThrow(/ao menos uma aba/);
  });
});
