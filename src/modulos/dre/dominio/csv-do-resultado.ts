import type { Dinheiro } from "@/compartilhado/dinheiro/indice";

/**
 * O demonstrativo em CSV, para abrir no Excel em portugues.
 *
 * Tres detalhes que decidem se o arquivo abre certo ou vira uma coluna so de
 * texto ilegivel:
 *
 * 1. SEPARADOR `;`. O Excel em pt-BR usa ponto e virgula, porque a virgula ja
 *    e o separador decimal. Com virgula, "1.234,56" viraria duas celulas.
 * 2. DECIMAL com virgula. `1234.56` chega como texto ou como mil duzentos e
 *    trinta e quatro mil e quinhentos e cinquenta e seis, dependendo da
 *    configuracao da maquina. Sem separador de milhar: ele atrapalha mais do
 *    que ajuda quando o destino e uma planilha.
 * 3. BOM no inicio. Sem ele o Excel le o arquivo como Windows-1252 e
 *    "Deduções" vira "DeduÃ§Ãµes".
 *
 * A planilha recebe NUMERO, nao "R$ 1.234,56": quem exporta vai somar,
 * filtrar e fazer grafico, e texto formatado nao soma.
 */

export const BOM_UTF8 = "﻿";
export const SEPARADOR_CSV = ";";

/** `1234.56` -> `1234,56`. Sem simbolo de moeda e sem separador de milhar. */
export function numeroParaPlanilha(valor: Dinheiro): string {
  return valor.paraTexto().replace(".", ",");
}

/**
 * O que uma planilha le como FORMULA quando esta no inicio da celula.
 *
 * `=` e o obvio; `+`, `-` e `@` tambem disparam o interpretador do Excel e do
 * LibreOffice; tabulacao e retorno de carro no inicio sao truques conhecidos
 * para esconder o `=` do olho de quem abre o arquivo num editor de texto.
 */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Protege um campo de TEXTO.
 *
 * Duas protecoes, nesta ordem:
 *
 * 1. Uma celula que comeca como formula ganha um apostrofo na frente. E o que
 *    a planilha usa para dizer "isto e texto", e e a unica defesa que vale:
 *    aspas em volta NAO impedem o Excel de executar `="..."`. Sem isto, uma
 *    descricao de titulo digitada por qualquer usuario viraria codigo no
 *    computador de quem exporta — `=HYPERLINK(...)` que leva dados embora, ou
 *    pior. Numeros do demonstrativo nao passam por aqui (`numeroParaPlanilha`),
 *    entao um valor negativo continua sendo numero.
 * 2. Aspas quando ha separador, aspas, quebra de linha ou o apostrofo
 *    recem-adicionado. Uma aspa dentro do texto vira duas, como manda o formato.
 */
export function campoCsv(texto: string): string {
  const neutralizado = INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  if (!/[;"\n\r']/.test(neutralizado)) return neutralizado;
  return `"${neutralizado.replace(/"/g, '""')}"`;
}

export interface LinhaParaCsv {
  readonly rotulo: string;
  readonly porMes: readonly Dinheiro[];
  readonly total: Dinheiro;
  /** Categorias aparecem recuadas sob a linha delas. */
  readonly categorias?: readonly { readonly categoriaNome: string; readonly porMes: readonly Dinheiro[]; readonly total: Dinheiro }[];
}

export interface CabecalhoDoCsv {
  readonly empresa: string;
  readonly regime: string;
  readonly periodo: string;
  readonly meses: readonly string[];
}

/**
 * Monta o arquivo inteiro.
 *
 * As tres primeiras linhas dizem de que empresa, de que regime e de que
 * periodo o arquivo e. Sem elas, uma planilha exportada perde o contexto no
 * primeiro encaminhamento de e-mail — e dois arquivos do mesmo mes em regimes
 * diferentes ficam indistinguiveis.
 */
export function montarCsvDoResultado(cabecalho: CabecalhoDoCsv, linhas: readonly LinhaParaCsv[]): string {
  const saida: string[] = [];
  const juntar = (campos: readonly string[]) => campos.join(SEPARADOR_CSV);

  saida.push(juntar([campoCsv("Empresa"), campoCsv(cabecalho.empresa)]));
  saida.push(juntar([campoCsv("Regime"), campoCsv(cabecalho.regime)]));
  saida.push(juntar([campoCsv("Período"), campoCsv(cabecalho.periodo)]));
  saida.push("");
  saida.push(juntar([campoCsv("Linha"), ...cabecalho.meses.map(campoCsv), campoCsv("Total")]));

  for (const linha of linhas) {
    saida.push(juntar([campoCsv(linha.rotulo), ...linha.porMes.map(numeroParaPlanilha), numeroParaPlanilha(linha.total)]));
    for (const categoria of linha.categorias ?? []) {
      saida.push(
        juntar([
          campoCsv(`    ${categoria.categoriaNome}`),
          ...categoria.porMes.map(numeroParaPlanilha),
          numeroParaPlanilha(categoria.total),
        ]),
      );
    }
  }

  // CRLF: e o que o Excel espera, e o que evita a ultima linha grudada.
  return BOM_UTF8 + saida.join("\r\n") + "\r\n";
}

/** Nome do arquivo baixado: reconhecivel na pasta de downloads meses depois. */
export function nomeDoArquivoCsv(regime: string, de: string, ate: string): string {
  return `resultados-${regime}-${de}-a-${ate}.csv`;
}
