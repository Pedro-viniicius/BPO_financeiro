import { describe, expect, it } from "vitest";

import { PONTOS_DE_QUEBRA, faixaDaLargura } from "./pontos-de-quebra";

describe("faixaDaLargura", () => {
  it("classifica cada faixa pelo limite inferior (desktop primeiro)", () => {
    expect(faixaDaLargura(320)).toBe("celular");
    expect(faixaDaLargura(PONTOS_DE_QUEBRA.celularMaximo)).toBe("celular");
    expect(faixaDaLargura(PONTOS_DE_QUEBRA.tablet)).toBe("tablet");
    expect(faixaDaLargura(PONTOS_DE_QUEBRA.desktop - 1)).toBe("tablet");
    expect(faixaDaLargura(PONTOS_DE_QUEBRA.desktop)).toBe("desktop");
    expect(faixaDaLargura(PONTOS_DE_QUEBRA.largo)).toBe("largo");
  });

  it("mantem os limites contiguos: celularMaximo + 1 = tablet", () => {
    expect(PONTOS_DE_QUEBRA.celularMaximo + 1).toBe(PONTOS_DE_QUEBRA.tablet);
  });
});
