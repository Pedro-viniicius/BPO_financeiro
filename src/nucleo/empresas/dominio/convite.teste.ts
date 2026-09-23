import { describe, expect, it } from "vitest";

import {
  ConviteInvalido,
  exigirConviteUtilizavel,
  expiracaoDoConvite,
  gerarTokenDeConvite,
  hashDoToken,
  hashesIguais,
  linkDoConvite,
  PRAZO_DO_CONVITE_HORAS,
} from "./convite";

const AGORA = new Date("2026-09-23T12:00:00Z");
const util = { expiraEm: new Date("2026-09-24T12:00:00Z"), aceitoEm: null, canceladoEm: null };

describe("token do convite", () => {
  it("e diferente a cada chamada e longo o bastante para nao ser adivinhado", () => {
    const tokens = new Set(Array.from({ length: 50 }, gerarTokenDeConvite));
    expect(tokens.size).toBe(50);
    // 32 bytes em base64url dao 43 caracteres.
    expect([...tokens][0]!.length).toBeGreaterThanOrEqual(43);
  });

  it("o hash e estavel e nao devolve o token", () => {
    const token = gerarTokenDeConvite();
    expect(hashDoToken(token)).toBe(hashDoToken(token));
    expect(hashDoToken(token)).not.toContain(token);
    expect(hashDoToken(token)).toHaveLength(64);
  });

  it("hashes diferentes nao se confundem", () => {
    expect(hashesIguais(hashDoToken("a"), hashDoToken("a"))).toBe(true);
    expect(hashesIguais(hashDoToken("a"), hashDoToken("b"))).toBe(false);
    expect(hashesIguais("curto", "bem mais longo")).toBe(false);
  });
});

describe("prazo", () => {
  it("expira em 48 horas", () => {
    expect(PRAZO_DO_CONVITE_HORAS).toBe(48);
    expect(expiracaoDoConvite(AGORA).toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });
});

describe("uso do convite", () => {
  it("aceita um convite dentro do prazo, nunca usado", () => {
    expect(() => exigirConviteUtilizavel(util, AGORA)).not.toThrow();
  });

  it("recusa o inexistente", () => {
    expect(() => exigirConviteUtilizavel(null, AGORA)).toThrow(ConviteInvalido);
  });

  it("USO UNICO: recusa o que ja foi aceito", () => {
    expect(() => exigirConviteUtilizavel({ ...util, aceitoEm: new Date() }, AGORA)).toThrow(/já foi usado/);
  });

  it("recusa o expirado, inclusive no instante exato do vencimento", () => {
    expect(() => exigirConviteUtilizavel({ ...util, expiraEm: AGORA }, AGORA)).toThrow(/expirou/);
  });

  it("recusa o cancelado", () => {
    expect(() => exigirConviteUtilizavel({ ...util, canceladoEm: new Date() }, AGORA)).toThrow(/cancelado/);
  });

  it("cancelado tem prioridade sobre expirado: a mensagem diz o que realmente aconteceu", () => {
    const vencidoECancelado = { expiraEm: new Date("2020-01-01"), aceitoEm: null, canceladoEm: new Date() };
    expect(() => exigirConviteUtilizavel(vencidoECancelado, AGORA)).toThrow(/cancelado/);
  });
});

describe("link", () => {
  it("nao duplica a barra final da URL da aplicacao", () => {
    expect(linkDoConvite("https://exemplo.com.br/", "abc")).toBe("https://exemplo.com.br/convite/abc");
    expect(linkDoConvite("https://exemplo.com.br", "abc")).toBe("https://exemplo.com.br/convite/abc");
  });
});
