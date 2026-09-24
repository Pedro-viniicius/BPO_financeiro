import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { anonimizarIp, ehDaGeracaoAtual, GERACAO_SAL_IP } from "./ip-anonimo";

const sal = "s".repeat(32);

describe("anonimizacao de IP (Gate 10)", () => {
  it("o mesmo IP com o mesmo sal da sempre o mesmo valor — e por isso que a trilha continua comparavel", () => {
    expect(anonimizarIp("203.0.113.7", sal)).toBe(anonimizarIp("203.0.113.7", sal));
  });

  it("o valor gravado nunca contem o IP e leva o prefixo de geracao", () => {
    const valor = anonimizarIp("203.0.113.7", sal);
    expect(valor).toMatch(new RegExp(`^${GERACAO_SAL_IP}:[0-9a-f]{64}$`));
    expect(valor).not.toContain("203.0.113.7");
    expect(ehDaGeracaoAtual(valor!)).toBe(true);
    expect(ehDaGeracaoAtual("v0:abc")).toBe(false);
  });

  it("sal diferente da valor diferente: sem o sal, o hash nao serve para reidentificar", () => {
    expect(anonimizarIp("203.0.113.7", sal)).not.toBe(anonimizarIp("203.0.113.7", "t".repeat(32)));
  });

  it("IPs diferentes nao colidem no caso trivial", () => {
    expect(anonimizarIp("203.0.113.7", sal)).not.toBe(anonimizarIp("203.0.113.8", sal));
  });

  it("sem sal, NAO registra: devolve null em vez de gravar o IP em claro", () => {
    expect(anonimizarIp("203.0.113.7", undefined)).toBeNull();
    expect(anonimizarIp("203.0.113.7", "")).toBeNull();
  });

  it("sem IP, devolve null", () => {
    expect(anonimizarIp(null, sal)).toBeNull();
    expect(anonimizarIp("   ", sal)).toBeNull();
  });

  it("e HMAC de verdade, nao sha256(sal + ip)", () => {
    // Se alguem trocar a construcao por concatenacao, o valor deixa de bater.
    const esperado = createHmac("sha256", sal).update("203.0.113.7", "utf8").digest("hex");
    expect(anonimizarIp("203.0.113.7", sal)).toBe(`v1:${esperado}`);
  });
});
