import { montarZip } from "@/compartilhado/arquivos/zip";

/**
 * Escritor de XLSX minimo, sem dependencia.
 *
 * Um XLSX e um ZIP de XMLs. Como o projeto ja tem o escritor de ZIP, o que
 * falta sao quatro arquivos de texto — bem menos do que trazer uma biblioteca
 * de planilha, que sao centenas de milhares de linhas com historico proprio de
 * vulnerabilidades, para gerar um modelo em branco.
 *
 * Escolhas deliberadas:
 *
 * - TEXTO EM `inlineStr`, e nao em `sharedStrings.xml`. A tabela
 *   compartilhada economiza espaco em planilha grande e repetitiva; aqui a
 *   planilha e um modelo de poucas linhas, e a tabela so acrescentaria uma
 *   indirecao onde um erro passa despercebido.
 * - DATAS COMO TEXTO. No XLSX, data e um numero contado desde 1900, com a
 *   famosa excecao do 29/02/1900 que nao existiu. Num arquivo que a pessoa vai
 *   PREENCHER, escrever "31/12/2025" como texto e mais honesto: ela digita no
 *   formato que le, e a importacao aceita o formato brasileiro.
 */

export type ValorDeCelula = string | number;

export interface AbaDaPlanilha {
  /** Ate 31 caracteres, sem : \\ / ? * [ ] — limite do proprio formato. */
  readonly nome: string;
  readonly linhas: readonly (readonly ValorDeCelula[])[];
  /** Larguras em "caracteres", como o Excel conta. */
  readonly larguras?: readonly number[];
}

const PROIBIDOS_NO_NOME = /[:\\/?*[\]]/g;

/** `0` -> A, `26` -> AA. */
function letraDaColuna(indice: number): string {
  let resto = indice + 1;
  let letra = "";
  while (resto > 0) {
    const atual = (resto - 1) % 26;
    letra = String.fromCharCode(65 + atual) + letra;
    resto = Math.floor((resto - atual) / 26);
  }
  return letra;
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle sao invalidos em XML 1.0 e fazem o Excel recusar
    // o arquivo inteiro, sem dizer qual celula.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function nomeValido(nome: string): string {
  const limpo = nome.replace(PROIBIDOS_NO_NOME, " ").trim();
  return limpo.slice(0, 31) || "Planilha";
}

function celula(referencia: string, valor: ValorDeCelula, ehCabecalho: boolean): string {
  const estilo = ehCabecalho ? ' s="1"' : "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${referencia}"${estilo}><v>${valor}</v></c>`;
  }
  const texto = escaparXml(String(valor));
  if (!texto) return `<c r="${referencia}"${estilo}/>`;
  return `<c r="${referencia}"${estilo} t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;
}

function aba(dados: AbaDaPlanilha): string {
  const colunas = dados.larguras?.length
    ? `<cols>${dados.larguras
        .map((largura, i) => `<col min="${i + 1}" max="${i + 1}" width="${largura}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const linhas = dados.linhas
    .map((valores, indiceLinha) => {
      const numero = indiceLinha + 1;
      const celulas = valores
        .map((valor, indiceColuna) => celula(`${letraDaColuna(indiceColuna)}${numero}`, valor, indiceLinha === 0))
        .join("");
      return `<row r="${numero}">${celulas}</row>`;
    })
    .join("");

  /*
   * `frozen` na primeira linha: numa planilha de importacao, rolar e perder o
   * cabecalho e o caminho mais curto para preencher a coluna errada.
   */
  const painel = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${painel}${colunas}<sheetData>${linhas}</sheetData></worksheet>`;
}

export function montarXlsx(abas: readonly AbaDaPlanilha[], agora = new Date()): Buffer {
  if (abas.length === 0) throw new Error("Uma planilha precisa de ao menos uma aba.");

  const nomes = abas.map((a) => nomeValido(a.nome));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${nomes.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;

  const relsRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((nome, i) => `<sheet name="${escaparXml(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;

  const relsWorkbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${nomes.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Dois estilos: o padrao e o do cabecalho (negrito com fundo).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;

  return montarZip(
    [
      { nome: "[Content_Types].xml", conteudo: contentTypes },
      { nome: "_rels/.rels", conteudo: relsRaiz },
      { nome: "xl/workbook.xml", conteudo: workbook },
      { nome: "xl/_rels/workbook.xml.rels", conteudo: relsWorkbook },
      { nome: "xl/styles.xml", conteudo: styles },
      ...abas.map((dados, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: aba(dados) })),
    ],
    agora,
  );
}
