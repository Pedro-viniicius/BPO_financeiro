import { describe, expect, it } from "vitest";

import { identificadorDoIp, identificadorDoToken, janelaDe, limiteDeEnviosValido, LimiteDeTentativasExcedido } from "./limite-tentativas";

describe("limite de tentativas", () => {
  it("a janela e a hora cheia, em UTC, para qualquer instante dentro dela", () => {
    expect(janelaDe(new Date("2026-09-24T13:00:00Z")).toISOString()).toBe("2026-09-24T13:00:00.000Z");
    expect(janelaDe(new Date("2026-09-24T13:59:59.999Z")).toISOString()).toBe("2026-09-24T13:00:00.000Z");
    expect(janelaDe(new Date("2026-09-24T14:00:00Z")).toISOString()).toBe("2026-09-24T14:00:00.000Z");
  });

  it("token e IP vivem em espacos separados de identificador", () => {
    expect(identificadorDoToken("abc")).toBe("token:abc");
    expect(identificadorDoIp("v1:abc")).toBe("ip:v1:abc");
    expect(identificadorDoToken("x")).not.toBe(identificadorDoIp("x"));
  });

  it("limite por empresa e inteiro entre 1 e 500", () => {
    expect(limiteDeEnviosValido(20)).toBe(true);
    expect(limiteDeEnviosValido(0)).toBe(false);
    expect(limiteDeEnviosValido(501)).toBe(false);
    expect(limiteDeEnviosValido(2.5)).toBe(false);
  });

  it("as mensagens nao revelam qual limite foi atingido nem numeros internos", () => {
    expect(new LimiteDeTentativasExcedido("ip").message).not.toMatch(/\d/);
    expect(new LimiteDeTentativasExcedido("token").message).not.toMatch(/\d/);
  });
});
