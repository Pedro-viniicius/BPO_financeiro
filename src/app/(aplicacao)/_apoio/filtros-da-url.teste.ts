import { describe, expect, it } from "vitest";

import { filtroDaUrl } from "./filtros-da-url";

const ID = "92a6f561-cebb-45bd-a887-2aecfb72fc84";

describe("filtro de lista lido da URL", () => {
  it("devolve o valor valido, sem espacos nas pontas", () => {
    const parametros = { busca: "  farinha ", situacao: "vencida", de: "2026-01-01", ate: "2026-12-31", fornecedor: ID, cliente: ID };
    expect(filtroDaUrl(parametros, "busca")).toBe("farinha");
    expect(filtroDaUrl(parametros, "situacao")).toBe("vencida");
    expect(filtroDaUrl(parametros, "de")).toBe("2026-01-01");
    expect(filtroDaUrl(parametros, "ate")).toBe("2026-12-31");
    expect(filtroDaUrl(parametros, "fornecedor")).toBe(ID);
    expect(filtroDaUrl(parametros, "cliente")).toBe(ID);
  });

  it("valor que derrubaria a consulta conta como filtro ausente", () => {
    expect(filtroDaUrl({ de: "abc" }, "de")).toBeUndefined();
    expect(filtroDaUrl({ ate: "2026-13-45" }, "ate")).toBeUndefined();
    expect(filtroDaUrl({ ate: "2026-02-30" }, "ate")).toBeUndefined();
    expect(filtroDaUrl({ fornecedor: "x" }, "fornecedor")).toBeUndefined();
    expect(filtroDaUrl({ cliente: "1; drop table" }, "cliente")).toBeUndefined();
  });

  it("situacao desconhecida nao esvazia a lista", () => {
    expect(filtroDaUrl({ situacao: "xyz" }, "situacao")).toBeUndefined();
  });

  it("vazio, repetido ou ausente conta como ausente", () => {
    expect(filtroDaUrl({ busca: "   " }, "busca")).toBeUndefined();
    expect(filtroDaUrl({ situacao: ["vencida", "aberta"] }, "situacao")).toBeUndefined();
    expect(filtroDaUrl({}, "de")).toBeUndefined();
  });

  it("busca livre nao tem validador: o texto vai como veio", () => {
    expect(filtroDaUrl({ busca: "%_'" }, "busca")).toBe("%_'");
  });
});
