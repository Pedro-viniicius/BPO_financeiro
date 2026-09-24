import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { CABECALHO_NONCE, CABECALHO_ROTA_ATUAL, config, politicaDeSeguranca, proxy } from "./proxy";

describe("proxy: Content-Security-Policy", () => {
  it("/entrar sai com CSP de nonce e frame-ancestors 'none'", () => {
    const resposta = proxy(new NextRequest("https://financeiro.exemplo.local/entrar?retorno=%2Finicio"));
    const csp = resposta.headers.get("Content-Security-Policy");

    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toMatch(/'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("o nonce da resposta e o mesmo que vai na requisicao, para o Next aplicar aos scripts", () => {
    const resposta = proxy(new NextRequest("https://financeiro.exemplo.local/contas-pagar"));
    const csp = resposta.headers.get("Content-Security-Policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    // O Next expoe os cabecalhos reescritos da requisicao com o prefixo abaixo.
    expect(resposta.headers.get(`x-middleware-request-${CABECALHO_NONCE}`)).toBe(nonce);
    expect(resposta.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(resposta.headers.get(`x-middleware-request-${CABECALHO_ROTA_ATUAL}`)).toBe("/contas-pagar");
  });

  it("cada requisicao recebe um nonce diferente", () => {
    const um = proxy(new NextRequest("https://financeiro.exemplo.local/inicio")).headers.get("Content-Security-Policy");
    const dois = proxy(new NextRequest("https://financeiro.exemplo.local/inicio")).headers.get("Content-Security-Policy");
    expect(um).not.toBe(dois);
  });

  it("fora de desenvolvimento nao ha 'unsafe-eval' nem 'unsafe-inline' em script-src", () => {
    const politica = politicaDeSeguranca("abc", false);
    const scriptSrc = politica.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(politica).toContain("upgrade-insecure-requests");
  });

  it("em desenvolvimento libera 'unsafe-eval' (pilhas de erro do React) e nao forca https", () => {
    const politica = politicaDeSeguranca("abc", true);
    expect(politica).toContain("'unsafe-eval'");
    expect(politica).not.toContain("upgrade-insecure-requests");
  });

  it("o recebimento do envio publico fica FORA do proxy (corpo grande); as paginas de /enviar ficam dentro", () => {
    const [padrao] = config.matcher;
    const expressao = new RegExp(`^${padrao!.replace(/^\//, "/")}$`);
    expect(expressao.test("/enviar/AbCdEfGhIjKlMnOpQrStUv/receber")).toBe(false);
    expect(expressao.test("/enviar/AbCdEfGhIjKlMnOpQrStUv")).toBe(true);
    expect(expressao.test("/enviar/AbCdEfGhIjKlMnOpQrStUv/recebido")).toBe(true);
    expect(expressao.test("/entrar")).toBe(true);
    expect(expressao.test("/_next/static/x.js")).toBe(false);
  });
});
