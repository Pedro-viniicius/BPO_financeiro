import { describe, expect, it } from "vitest";

import { caminhoSvgDoQr, gerarMatrizQr, svgDoQr, VERSAO_MAXIMA_QR, ZONA_QUIETA_QR } from "./qr-svg";

/** URL no formato real do QR de captura: 22 caracteres de token. */
const URL_DE_ENVIO = "https://financeiro.novadidata.com.br/enviar/AbCdEfGhIjKlMnOpQrStUv";

describe("QR em SVG", () => {
  it("uma URL de envio com o dominio de producao cai na versao 5 (37x37) — pouco densa, le na primeira tentativa", () => {
    const matriz = gerarMatrizQr(URL_DE_ENVIO);
    // Conferido com decodificador independente (zxing-cpp): versao 5, nivel M.
    expect(matriz.versao).toBe(5);
    expect(matriz.tamanho).toBe(17 + 4 * matriz.versao);
    expect(matriz.modulos).toHaveLength(matriz.tamanho);
    for (const linha of matriz.modulos) expect(linha).toHaveLength(matriz.tamanho);
  });

  it("tem os tres padroes de posicao nos cantos (o que o leitor procura primeiro)", () => {
    const { modulos, tamanho } = gerarMatrizQr(URL_DE_ENVIO);
    const t = tamanho;
    // Anel externo escuro, anel interno claro, centro escuro — em cada canto.
    for (const [x0, y0] of [[0, 0], [t - 7, 0], [0, t - 7]] as const) {
      expect(modulos[y0]![x0]).toBe(true);
      expect(modulos[y0 + 1]![x0 + 1]).toBe(false);
      expect(modulos[y0 + 3]![x0 + 3]).toBe(true);
      expect(modulos[y0 + 6]![x0 + 6]).toBe(true);
    }
  });

  it("recusa texto que nao cabe na versao maxima, em vez de gerar um QR ilegivel", () => {
    expect(VERSAO_MAXIMA_QR).toBe(10);
    expect(() => gerarMatrizQr("x".repeat(2000))).toThrow();
  });

  it("o caminho SVG tem exatamente um quadrado por modulo escuro, deslocado pela zona quieta", () => {
    const matriz = gerarMatrizQr(URL_DE_ENVIO);
    const escuros = matriz.modulos.flat().filter(Boolean).length;
    const caminho = caminhoSvgDoQr(matriz);
    expect(caminho.match(/h1v1h-1z/g)).toHaveLength(escuros);
    expect(caminho.startsWith(`M${ZONA_QUIETA_QR} ${ZONA_QUIETA_QR}h1v1h-1z`)).toBe(true);
  });

  it("o SVG completo e autocontido, com zona quieta branca e rotulo escapado", () => {
    const matriz = gerarMatrizQr(URL_DE_ENVIO);
    const svg = svgDoQr(matriz, 'Envio <"Nova & Didata">');
    const lado = matriz.tamanho + ZONA_QUIETA_QR * 2;
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${lado} ${lado}"`);
    expect(svg).toContain(`<rect width="${lado}" height="${lado}" fill="#fff"/>`);
    expect(svg).toContain("aria-label=\"Envio &lt;&quot;Nova &amp; Didata&quot;>\"");
    expect(svg).not.toContain("<script");
  });

  it("o mesmo texto gera sempre a mesma matriz (determinismo: o QR impresso continua valendo)", () => {
    expect(gerarMatrizQr(URL_DE_ENVIO)).toEqual(gerarMatrizQr(URL_DE_ENVIO));
  });
});
