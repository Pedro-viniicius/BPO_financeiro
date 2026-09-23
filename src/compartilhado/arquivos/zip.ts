import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

/**
 * Escritor de ZIP, sem dependencia externa.
 *
 * O projeto tem sete dependencias de producao, e cada uma nova e superficie de
 * ataque e trabalho de atualizacao para sempre. ZIP e um formato simples o
 * bastante para escrever aqui: a compressao vem do `zlib` do proprio Node, e o
 * que sobra sao tres estruturas de cabecalho.
 *
 * Serve a dois lugares: a exportacao completa dos dados e a planilha modelo
 * (um XLSX e um ZIP de XMLs).
 *
 * Escreve apenas o formato classico (sem ZIP64), entao o limite e 4 GB por
 * arquivo e 65.535 arquivos — folgado para os dois usos, e conferido abaixo.
 */

export interface ArquivoDoZip {
  /** Caminho dentro do ZIP, com `/` como separador. */
  readonly nome: string;
  readonly conteudo: Buffer | string;
  /** Padrao: comprimir. Texto ja comprimido nao ganha nada e gasta tempo. */
  readonly comprimir?: boolean;
}

const MAXIMO_ARQUIVOS = 65_535;
const MAXIMO_BYTES = 0xffff_ffff;

/** CRC-32, exigido pelo formato. Tabela montada uma vez. */
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let valor = i;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb8_8320 ^ (valor >>> 1) : valor >>> 1;
    }
    tabela[i] = valor >>> 0;
  }
  return tabela;
})();

function crc32(dados: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of dados) {
    crc = TABELA_CRC[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

/**
 * Data e hora no formato MS-DOS, que e o que o ZIP guarda.
 *
 * Sem fuso: o formato nao tem onde guardar um. Grava-se a hora LOCAL, que e o
 * que os descompactadores mostram.
 */
function dataHoraDos(data: Date): { hora: number; dia: number } {
  const ano = Math.max(1980, data.getFullYear());
  return {
    hora: (data.getHours() << 11) | (data.getMinutes() << 5) | Math.floor(data.getSeconds() / 2),
    dia: ((ano - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate(),
  };
}

export function montarZip(arquivos: readonly ArquivoDoZip[], agora = new Date()): Buffer {
  if (arquivos.length > MAXIMO_ARQUIVOS) {
    throw new Error(`Um ZIP sem ZIP64 comporta ${MAXIMO_ARQUIVOS} arquivos; foram pedidos ${arquivos.length}.`);
  }

  const { hora, dia } = dataHoraDos(agora);
  const pedacos: Buffer[] = [];
  const diretorio: Buffer[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, "utf8");
    const bruto = Buffer.isBuffer(arquivo.conteudo) ? arquivo.conteudo : Buffer.from(arquivo.conteudo, "utf8");

    if (bruto.length > MAXIMO_BYTES) {
      throw new Error(`"${arquivo.nome}" tem mais de 4 GB, o que exigiria ZIP64.`);
    }

    const comprimir = arquivo.comprimir ?? true;
    const dados = comprimir ? deflateRawSync(bruto, { level: 6 }) : bruto;
    const metodo = comprimir ? 8 : 0;
    const crc = crc32(bruto);

    // Cabecalho local
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4); // versao minima
    local.writeUInt16LE(0x0800, 6); // nome em UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    pedacos.push(local, nome, dados);

    // Entrada do diretorio central
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(bruto.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    diretorio.push(central, nome);

    deslocamento += local.length + nome.length + dados.length;
  }

  const central = Buffer.concat(diretorio);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x0605_4b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(central.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...pedacos, central, fim]);
}

/** SHA-256 do ZIP, para quem quiser conferir que o download chegou inteiro. */
export function somaDeVerificacao(zip: Buffer): string {
  return createHash("sha256").update(zip).digest("hex");
}
