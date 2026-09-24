import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { gerarMatrizQr, ZONA_QUIETA_QR } from "@/compartilhado/qr/indice";

import { CodigoQr } from "./codigo-qr";

describe("CodigoQr", () => {
  it("desenha um SVG acessivel com a zona quieta dentro do proprio viewBox", () => {
    const matriz = gerarMatrizQr("https://exemplo.com.br/enviar/AbCdEfGhIjKlMnOpQrStUv");
    const html = renderToStaticMarkup(<CodigoQr matriz={matriz} rotulo="QR de envio" />);
    const lado = matriz.tamanho + ZONA_QUIETA_QR * 2;
    expect(html).toContain(`viewBox="0 0 ${lado} ${lado}"`);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR de envio"');
    expect(html).toMatch(/ d="M4 4h1v1h-1z/);
    // Nada de script ou evento: e desenho puro, serve tambem para imprimir.
    expect(html).not.toMatch(/on[a-z]+=|<script/i);
  });
});
