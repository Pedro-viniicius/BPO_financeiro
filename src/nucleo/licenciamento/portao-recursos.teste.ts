import { describe, expect, it } from "vitest";

import { PortaoRecursosPorLicenca } from "./portao-recursos-por-licenca";

describe("portao de recursos", () => {
  it("sem licenca, roda no modo base da versao 1 (sem IA nem integracoes)", () => {
    const portao = new PortaoRecursosPorLicenca(null);
    expect(portao.estaHabilitado("operacao_financeira")).toBe(true);
    expect(portao.estaHabilitado("conciliacao_bancaria")).toBe(true);
    expect(portao.estaHabilitado("analises_ia")).toBe(false);
    expect(portao.estaHabilitado("integracao_bancaria")).toBe(false);
  });

  it("com licenca, soma os recursos contratados aos da base", () => {
    const portao = new PortaoRecursosPorLicenca({
      cliente: "Empresa Exemplo",
      versaoPrincipal: 1,
      recursos: ["analises_ia"],
      emitidaEm: "2026-09-18",
    });
    expect(portao.estaHabilitado("analises_ia")).toBe(true);
    expect(portao.estaHabilitado("integracao_bancaria")).toBe(false);
    expect(portao.estaHabilitado("dre_visualizar" as never)).toBe(false);
  });
});
