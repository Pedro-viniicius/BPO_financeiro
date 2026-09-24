import { describe, expect, it } from "vitest";

import { gerarTokenDeCaptura, hashDoTokenDeCaptura, linkDeEnvio, temFormatoDeToken } from "./token-captura";

describe("token de captura", () => {
  it("tem 22 caracteres de base64url e nunca se repete", () => {
    const tokens = new Set(Array.from({ length: 200 }, gerarTokenDeCaptura));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(temFormatoDeToken(token)).toBe(true);
  });

  it("o hash nao contem o token e e sempre o mesmo para o mesmo token", () => {
    const token = gerarTokenDeCaptura();
    const hash = hashDoTokenDeCaptura(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashDoTokenDeCaptura(token)).toBe(hash);
  });

  it("recusa formato errado antes de qualquer consulta", () => {
    expect(temFormatoDeToken("")).toBe(false);
    expect(temFormatoDeToken("curto")).toBe(false);
    expect(temFormatoDeToken("a".repeat(23))).toBe(false);
    expect(temFormatoDeToken("AbCdEfGhIjKlMnOpQrSt!v")).toBe(false);
    expect(temFormatoDeToken("' OR 1=1 --            ")).toBe(false);
  });

  it("monta a URL curta de envio, sem barra dupla", () => {
    expect(linkDeEnvio("https://financeiro.novadidata.com.br/", "AbCdEfGhIjKlMnOpQrStUv")).toBe(
      "https://financeiro.novadidata.com.br/enviar/AbCdEfGhIjKlMnOpQrStUv",
    );
  });
});
