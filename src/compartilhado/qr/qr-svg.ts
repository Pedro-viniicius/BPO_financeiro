import { qrcodegen } from "./qrcodegen";

/**
 * Geracao de QR code em SVG, sobre o `qrcodegen` incorporado (ADR-028).
 *
 * O que esta camada decide, e o codigo de terceiro nao:
 * - nivel de correcao M (15% de dano recuperavel): o QR vai ser impresso,
 *   colado num balcao e fotografado de lado. L nao aguenta isso; Q e H
 *   aumentam a densidade sem necessidade para uma URL curta;
 * - versao maxima 10: a URL de envio com o dominio de producao tem 66
 *   caracteres e cai na versao 5 (37x37 modulos; a versao 4-M para em 62
 *   bytes). Se um dia o texto nao couber na 10, e erro — nunca um QR de
 *   versao 30 que nenhum celular fraco le;
 * - zona quieta de 4 modulos, que e o minimo da norma. Sem ela, leitores
 *   confundem a borda do QR com o que esta em volta.
 */
export interface MatrizQr {
  /** Modulos por lado (21 na versao 1, +4 por versao). */
  readonly tamanho: number;
  readonly versao: number;
  /** `modulos[y][x]` verdadeiro = modulo escuro. */
  readonly modulos: readonly (readonly boolean[])[];
}

export const VERSAO_MAXIMA_QR = 10;
export const ZONA_QUIETA_QR = 4;

export function gerarMatrizQr(texto: string): MatrizQr {
  const segmentos = qrcodegen.QrSegment.makeSegments(texto);
  const qr = qrcodegen.QrCode.encodeSegments(segmentos, qrcodegen.QrCode.Ecc.MEDIUM, 1, VERSAO_MAXIMA_QR);
  const modulos: boolean[][] = [];
  for (let y = 0; y < qr.size; y += 1) {
    const linha: boolean[] = [];
    for (let x = 0; x < qr.size; x += 1) linha.push(qr.getModule(x, y));
    modulos.push(linha);
  }
  return { tamanho: qr.size, versao: qr.version, modulos };
}

/** Caminho SVG com um quadrado por modulo escuro. Mesma geometria usada pelo componente de tela. */
export function caminhoSvgDoQr(matriz: MatrizQr, margem = ZONA_QUIETA_QR): string {
  const partes: string[] = [];
  matriz.modulos.forEach((linha, y) => {
    linha.forEach((escuro, x) => {
      if (escuro) partes.push(`M${x + margem} ${y + margem}h1v1h-1z`);
    });
  });
  return partes.join("");
}

/**
 * SVG completo, para download e impressao.
 *
 * Preto sobre branco literal, e nao tokens de cor: aqui a cor nao e desenho,
 * e requisito de leitura — o leitor precisa do contraste maximo, e um QR na
 * cor da marca e um QR que falha no sol.
 */
export function svgDoQr(matriz: MatrizQr, rotulo: string, margem = ZONA_QUIETA_QR): string {
  const lado = matriz.tamanho + margem * 2;
  const rotuloEscapado = rotulo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="${rotuloEscapado}">` +
    `<rect width="${lado}" height="${lado}" fill="#fff"/>` +
    `<path d="${caminhoSvgDoQr(matriz, margem)}" fill="#000"/>` +
    `</svg>`
  );
}
