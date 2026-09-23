/**
 * Leitor de CSV para planilhas preenchidas por gente.
 *
 * O arquivo chega do Excel em portugues, e cada detalhe abaixo ja quebrou
 * importacao em algum sistema:
 *
 * - SEPARADOR. O Excel em pt-BR grava com `;`, porque a virgula e o separador
 *   decimal. Mas quem salva de um Google Sheets ou exporta de outro sistema
 *   manda `,`. O separador e DESCOBERTO pela linha de cabecalho, em vez de
 *   imposto — recusar um arquivo por isso seria recusar metade deles.
 * - BOM. O Excel escreve `﻿` no inicio. Sem remover, o primeiro cabecalho
 *   vira "﻿Nome" e nenhuma coluna e reconhecida.
 * - ASPAS. Campo com separador dentro vem entre aspas, e uma aspa dentro do
 *   campo vem dobrada.
 * - FIM DE LINHA. `\r\n` do Windows, `\n` do resto.
 *
 * O leitor NAO interpreta valores: devolve texto. Quem sabe o que e uma data
 * ou um dinheiro e a validacao de cada planilha, que tem como explicar o erro
 * na linguagem daquela coluna.
 */

export interface LinhaDaPlanilha {
  /** Numero da linha no ARQUIVO, contando o cabecalho. E o que a pessoa ve no Excel. */
  readonly numero: number;
  readonly campos: Readonly<Record<string, string>>;
}

export interface PlanilhaLida {
  readonly cabecalhos: readonly string[];
  readonly linhas: readonly LinhaDaPlanilha[];
  readonly separador: string;
}

const SEPARADORES = [";", ",", "\t"] as const;

/** O separador que mais divide a primeira linha fora de aspas. */
function descobrirSeparador(primeiraLinha: string): string {
  let melhor = ";";
  let maior = 0;
  for (const candidato of SEPARADORES) {
    const quantidade = dividirLinha(primeiraLinha, candidato).length;
    if (quantidade > maior) {
      maior = quantidade;
      melhor = candidato;
    }
  }
  return melhor;
}

/** Divide UMA linha respeitando aspas. Usado so para descobrir o separador. */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i]!;
    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += caractere;
    }
  }
  campos.push(atual);
  return campos;
}

/** Normaliza cabecalho para casar "Nome do cliente", "nome do cliente" e "NOME DO CLIENTE". */
export function normalizarCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function lerCsv(conteudo: string): PlanilhaLida {
  const semBom = conteudo.replace(/^﻿/, "");
  if (!semBom.trim()) return { cabecalhos: [], linhas: [], separador: ";" };

  // Percorre o texto inteiro de uma vez: uma quebra de linha DENTRO de aspas
  // faz parte do campo, e dividir por linha antes disso perderia esse caso.
  const fimDaPrimeira = semBom.search(/\r?\n/);
  const primeiraLinha = fimDaPrimeira === -1 ? semBom : semBom.slice(0, fimDaPrimeira);
  const separador = descobrirSeparador(primeiraLinha);

  const linhasBrutas: string[][] = [];
  let campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  const fecharCampo = () => {
    campos.push(atual);
    atual = "";
  };
  const fecharLinha = () => {
    fecharCampo();
    linhasBrutas.push(campos);
    campos = [];
  };

  for (let i = 0; i < semBom.length; i += 1) {
    const caractere = semBom[i]!;
    if (caractere === '"') {
      if (dentroDeAspas && semBom[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === separador && !dentroDeAspas) {
      fecharCampo();
    } else if ((caractere === "\n" || caractere === "\r") && !dentroDeAspas) {
      if (caractere === "\r" && semBom[i + 1] === "\n") i += 1;
      fecharLinha();
    } else {
      atual += caractere;
    }
  }
  if (atual !== "" || campos.length > 0) fecharLinha();

  const [cabecalhoBruto, ...corpo] = linhasBrutas;
  if (!cabecalhoBruto) return { cabecalhos: [], linhas: [], separador };

  const cabecalhos = cabecalhoBruto.map((texto) => normalizarCabecalho(texto));

  const linhas: LinhaDaPlanilha[] = [];
  corpo.forEach((valores, indice) => {
    // Linha totalmente em branco e separador de secao no Excel, nao dado.
    if (valores.every((valor) => valor.trim() === "")) return;

    const campos: Record<string, string> = {};
    cabecalhos.forEach((cabecalho, coluna) => {
      if (cabecalho) campos[cabecalho] = (valores[coluna] ?? "").trim();
    });
    linhas.push({ numero: indice + 2, campos });
  });

  return { cabecalhos, linhas, separador };
}
