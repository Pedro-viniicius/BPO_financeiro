import { describe, expect, it } from "vitest";

import { ehAtivacaoDeSegundoFator } from "./portao-segundo-fator";

/**
 * O acordo do Gate 4 sobre o segundo fator: ninguem pode se trancar para fora.
 *
 * Isso se apoia em duas metades, e as duas sao testadas aqui:
 *   1. ATIVAR e impossivel enquanto nao houver tela de ativacao;
 *   2. VERIFICAR e DESLIGAR continuam possiveis, para quem ja tiver o fator.
 *
 * Se alguem abrir a ativacao sem abrir a tela, o primeiro bloco falha. Se
 * alguem fechar a verificacao ou o desligamento, o segundo bloco falha.
 */

describe("ativacao do segundo fator: fechada", () => {
  it.each([
    "/api/autenticacao/two-factor/enable",
    "/api/autenticacao/two-factor/get-totp-uri",
    "/api/autenticacao/two-factor/generate-backup-codes",
  ])("recusa %s", (caminho) => {
    expect(ehAtivacaoDeSegundoFator(caminho)).toBe(true);
  });

  it("recusa tambem com barra final, maiusculas e query", () => {
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/two-factor/enable/")).toBe(true);
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/TWO-FACTOR/Enable")).toBe(true);
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/two-factor/enable?x=1")).toBe(true);
  });

  it("recusa mesmo quando o caminho chega como URL completa", () => {
    expect(ehAtivacaoDeSegundoFator("https://exemplo.com.br/api/autenticacao/two-factor/enable")).toBe(true);
  });
});

describe("verificacao e desligamento: abertos (senao o bloqueio viraria a tranca)", () => {
  it.each([
    "/api/autenticacao/two-factor/verify-totp",
    "/api/autenticacao/two-factor/verify-backup-code",
    "/api/autenticacao/two-factor/verify-otp",
    "/api/autenticacao/two-factor/send-otp",
    "/api/autenticacao/two-factor/disable",
  ])("deixa passar %s", (caminho) => {
    expect(ehAtivacaoDeSegundoFator(caminho)).toBe(false);
  });

  it("nao interfere no resto da autenticacao", () => {
    for (const caminho of [
      "/api/autenticacao/sign-in/email",
      "/api/autenticacao/sign-up/email",
      "/api/autenticacao/sign-out",
      "/api/autenticacao/request-password-reset",
      "/api/autenticacao/reset-password",
      "/api/saude",
    ]) {
      expect(ehAtivacaoDeSegundoFator(caminho)).toBe(false);
    }
  });

  it("nao se deixa enganar por caminho parecido", () => {
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/two-factor/enable-algo")).toBe(false);
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/two-factor/enablex")).toBe(false);
    expect(ehAtivacaoDeSegundoFator("/api/autenticacao/outro/two-factor/enable")).toBe(false);
  });
});
