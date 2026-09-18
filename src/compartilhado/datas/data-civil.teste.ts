import { describe, expect, it } from "vitest";

import {
  adicionarDias,
  adicionarMeses,
  competenciaMensal,
  criarDataCivil,
  dataCivilDeTexto,
  dataCivilDeTextoBrasileiro,
  diasEntre,
  ehFimDeSemana,
  fimDoMes,
  formatarDataBrasileira,
  hojeDataCivil,
  inicioDoMes,
} from "./data-civil";

describe("DataCivil", () => {
  it("cria e valida datas", () => {
    expect(criarDataCivil(2026, 2, 28)).toBe("2026-02-28");
    expect(() => criarDataCivil(2026, 2, 30)).toThrow(RangeError);
    expect(() => criarDataCivil(2026, 13, 1)).toThrow(RangeError);
    expect(criarDataCivil(2024, 2, 29)).toBe("2024-02-29"); // bissexto
  });

  it("interpreta texto ISO e brasileiro", () => {
    expect(dataCivilDeTexto("2026-09-18")).toBe("2026-09-18");
    expect(() => dataCivilDeTexto("18/09/2026")).toThrow(SyntaxError);
    expect(dataCivilDeTextoBrasileiro("18/09/2026")).toBe("2026-09-18");
    expect(formatarDataBrasileira(dataCivilDeTexto("2026-01-05"))).toBe("05/01/2026");
  });

  it("adiciona dias atravessando meses e anos", () => {
    expect(adicionarDias(dataCivilDeTexto("2026-12-31"), 1)).toBe("2027-01-01");
    expect(adicionarDias(dataCivilDeTexto("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("adiciona meses respeitando o ultimo dia do mes (regra de recorrencia)", () => {
    expect(adicionarMeses(dataCivilDeTexto("2026-01-31"), 1)).toBe("2026-02-28");
    expect(adicionarMeses(dataCivilDeTexto("2026-01-31"), 2)).toBe("2026-03-31");
    expect(adicionarMeses(dataCivilDeTexto("2026-11-15"), 3)).toBe("2027-02-15");
    expect(adicionarMeses(dataCivilDeTexto("2026-03-31"), -1)).toBe("2026-02-28");
  });

  it("calcula dias entre datas (dias de atraso)", () => {
    expect(diasEntre(dataCivilDeTexto("2026-09-01"), dataCivilDeTexto("2026-09-18"))).toBe(17);
    expect(diasEntre(dataCivilDeTexto("2026-09-18"), dataCivilDeTexto("2026-09-01"))).toBe(-17);
  });

  it("calcula inicio, fim e competencia do mes", () => {
    const data = dataCivilDeTexto("2026-02-10");
    expect(inicioDoMes(data)).toBe("2026-02-01");
    expect(fimDoMes(data)).toBe("2026-02-28");
    expect(competenciaMensal(data)).toBe("2026-02");
  });

  it("identifica fim de semana", () => {
    expect(ehFimDeSemana(dataCivilDeTexto("2026-09-19"))).toBe(true); // sabado
    expect(ehFimDeSemana(dataCivilDeTexto("2026-09-21"))).toBe(false); // segunda
  });

  it("calcula hoje no fuso de Sao Paulo, nao em UTC", () => {
    // 02:00 UTC de 19/09 ainda e 23:00 de 18/09 em Sao Paulo
    const instante = new Date("2026-09-19T02:00:00Z");
    expect(hojeDataCivil("America/Sao_Paulo", instante)).toBe("2026-09-18");
    expect(hojeDataCivil("UTC", instante)).toBe("2026-09-19");
  });
});
