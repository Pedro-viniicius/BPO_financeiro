import { afterEach, describe, expect, it } from "vitest";

import { limparCacheVariaveisAmbiente } from "@/nucleo/configuracao/variaveis-ambiente";

import { montarEnviadorEmail } from "./email";

/**
 * A regra do Gate 4 sobre e-mail: **nunca fingir que enviou**.
 *
 * O comportamento anterior era cair em silencio para o modo console quando
 * `EMAIL_PROVEDOR=smtp` — a tela dizia "enviamos", o log dizia "aviso" e
 * ninguem recebia a redefinicao de senha. Em producao isso nao aparece ate
 * alguem perder o acesso.
 */

const AMBIENTE_BASE = {
  BANCO_URL: "postgres://u:s@localhost:5432/financeiro",
  APLICACAO_URL: "http://localhost:3000",
  APLICACAO_SEGREDO: "segredo-de-teste-com-pelo-menos-32-caracteres",
  // Producao exige o sal do IP (Gate 10); sem ele o boot para antes do e-mail.
  AUDITORIA_SAL_IP: "sal-de-teste-com-pelo-menos-32-caracteres!",
};

function comAmbiente(extra: Record<string, string>): void {
  Object.assign(process.env, AMBIENTE_BASE, extra);
  limparCacheVariaveisAmbiente();
}

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  limparCacheVariaveisAmbiente();
});

describe("montarEnviadorEmail", () => {
  it("EMAIL_PROVEDOR=smtp falha na hora, em vez de cair para console fingindo entrega", () => {
    comAmbiente({ EMAIL_PROVEDOR: "smtp", AMBIENTE: "producao" });
    expect(() => montarEnviadorEmail()).toThrow(/nenhum adaptador SMTP/i);
  });

  it("a mensagem de erro diz o que fazer, nao so o que quebrou", () => {
    comAmbiente({ EMAIL_PROVEDOR: "smtp", AMBIENTE: "desenvolvimento" });
    expect(() => montarEnviadorEmail()).toThrow(/EMAIL_PROVEDOR=console|implemente o adaptador/i);
  });

  it("EMAIL_PROVEDOR=console entrega um enviador utilizavel em desenvolvimento", async () => {
    comAmbiente({ EMAIL_PROVEDOR: "console", AMBIENTE: "desenvolvimento" });
    const enviador = montarEnviadorEmail();
    await expect(enviador.enviar({ para: "a@b.local", assunto: "oi", texto: "corpo" })).resolves.toBeUndefined();
  });

  it("em producao com console o sistema sobe, mas nao promete entrega", () => {
    // Nao e erro fatal: a instalacao pode ainda nao usar e-mail. O aviso no log
    // e o que impede isso de passar despercebido.
    comAmbiente({ EMAIL_PROVEDOR: "console", AMBIENTE: "producao" });
    expect(() => montarEnviadorEmail()).not.toThrow();
  });
});
