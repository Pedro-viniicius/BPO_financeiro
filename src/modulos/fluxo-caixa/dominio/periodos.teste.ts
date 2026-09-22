import { describe, expect, it } from "vitest";

import { dataCivilDeTexto, hojeDataCivil } from "@/compartilhado/datas/indice";

import { fimDaSemana, gerarPeriodos, inicioDaSemana, periodoPadrao } from "./periodos";

const dia = (texto: string) => dataCivilDeTexto(texto);

describe("semana comeca na segunda", () => {
  it("segunda e o proprio inicio", () => {
    expect(inicioDaSemana(dia("2026-09-21"))).toBe("2026-09-21"); // segunda
    expect(fimDaSemana(dia("2026-09-21"))).toBe("2026-09-27"); // domingo
  });

  it("domingo pertence a semana que comecou na segunda anterior", () => {
    expect(inicioDaSemana(dia("2026-09-27"))).toBe("2026-09-21");
    expect(fimDaSemana(dia("2026-09-27"))).toBe("2026-09-27");
  });

  it("quarta cai no meio da mesma semana", () => {
    expect(inicioDaSemana(dia("2026-09-23"))).toBe("2026-09-21");
  });

  it("a semana atravessa a virada de mes", () => {
    expect(inicioDaSemana(dia("2026-10-01"))).toBe("2026-09-28");
    expect(fimDaSemana(dia("2026-09-28"))).toBe("2026-10-04");
  });
});

describe("geracao de periodos", () => {
  it("por mes, tudo no passado, vem tudo realizado", () => {
    const periodos = gerarPeriodos(dia("2026-06-01"), dia("2026-08-31"), "mes", dia("2026-09-22"));
    expect(periodos.map((p) => p.rotulo)).toEqual(["junho de 2026", "julho de 2026", "agosto de 2026"]);
    expect(periodos.every((p) => p.natureza === "realizado")).toBe(true);
  });

  it("por mes, tudo no futuro, vem tudo previsto", () => {
    const periodos = gerarPeriodos(dia("2026-11-01"), dia("2026-12-31"), "mes", dia("2026-09-22"));
    expect(periodos.every((p) => p.natureza === "previsto")).toBe(true);
  });

  it("o mes que contem hoje QUEBRA em realizado e previsto", () => {
    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-09-30"), "mes", dia("2026-09-22"));

    expect(periodos).toHaveLength(2);
    expect(periodos[0]).toMatchObject({
      inicio: "2026-09-01",
      fim: "2026-09-22",
      natureza: "realizado",
      rotulo: "setembro de 2026 · até hoje",
    });
    expect(periodos[1]).toMatchObject({
      inicio: "2026-09-23",
      fim: "2026-09-30",
      natureza: "previsto",
      rotulo: "setembro de 2026 · previsto",
    });
  });

  it("os dois pedacos se encaixam sem buraco nem sobreposicao", () => {
    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-09-30"), "mes", dia("2026-09-22"));
    expect(periodos[0]!.fim).toBe("2026-09-22");
    expect(periodos[1]!.inicio).toBe("2026-09-23");
  });

  it("hoje no ULTIMO dia do mes nao gera linha prevista vazia", () => {
    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-09-30"), "mes", dia("2026-09-30"));
    expect(periodos).toHaveLength(1);
    expect(periodos[0]?.natureza).toBe("realizado");
  });

  it("hoje no PRIMEIRO dia do mes deixa realizado so o dia de hoje", () => {
    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-09-30"), "mes", dia("2026-09-01"));
    expect(periodos).toHaveLength(2);
    expect(periodos[0]).toMatchObject({ inicio: "2026-09-01", fim: "2026-09-01", natureza: "realizado" });
    expect(periodos[1]).toMatchObject({ inicio: "2026-09-02", fim: "2026-09-30", natureza: "previsto" });
  });

  it("por dia, hoje e realizado e amanha e previsto", () => {
    const periodos = gerarPeriodos(dia("2026-09-21"), dia("2026-09-23"), "dia", dia("2026-09-22"));
    expect(periodos.map((p) => [p.inicio, p.natureza])).toEqual([
      ["2026-09-21", "realizado"],
      ["2026-09-22", "realizado"],
      ["2026-09-23", "previsto"],
    ]);
  });

  it("por semana, a semana de hoje quebra no dia de hoje", () => {
    const periodos = gerarPeriodos(dia("2026-09-21"), dia("2026-09-27"), "semana", dia("2026-09-23"));
    expect(periodos).toHaveLength(2);
    expect(periodos[0]).toMatchObject({ inicio: "2026-09-21", fim: "2026-09-23", natureza: "realizado" });
    expect(periodos[1]).toMatchObject({ inicio: "2026-09-24", fim: "2026-09-27", natureza: "previsto" });
  });

  it("o primeiro e o ultimo periodo sao recortados pelo intervalo pedido", () => {
    const periodos = gerarPeriodos(dia("2026-06-10"), dia("2026-08-20"), "mes", dia("2026-09-22"));
    expect(periodos[0]).toMatchObject({ inicio: "2026-06-10", fim: "2026-06-30" });
    expect(periodos.at(-1)).toMatchObject({ inicio: "2026-08-01", fim: "2026-08-20" });
  });

  it("intervalo invertido devolve lista vazia em vez de laco infinito", () => {
    expect(gerarPeriodos(dia("2026-09-30"), dia("2026-09-01"), "mes", dia("2026-09-22"))).toEqual([]);
  });

  it("intervalo absurdo e cortado, nao trava a pagina", () => {
    const periodos = gerarPeriodos(dia("2000-01-01"), dia("2099-12-31"), "dia", dia("2026-09-22"));
    expect(periodos.length).toBeLessThanOrEqual(400);
  });

  it("os periodos cobrem o intervalo em ordem, sem buraco", () => {
    const periodos = gerarPeriodos(dia("2026-08-01"), dia("2026-10-31"), "mes", dia("2026-09-22"));
    for (let i = 1; i < periodos.length; i++) {
      const anterior = periodos[i - 1]!;
      const atual = periodos[i]!;
      expect(atual.inicio > anterior.fim, `${anterior.fim} -> ${atual.inicio}`).toBe(true);
    }
  });
});

describe("fuso horario de Sao Paulo na virada do periodo", () => {
  it("as 22h de Brasilia ainda e o mes anterior, embora em UTC ja seja o dia 1", () => {
    // 2026-10-01 01:00 UTC = 2026-09-30 22:00 em Sao Paulo.
    const instante = new Date("2026-10-01T01:00:00Z");
    const hojeSaoPaulo = hojeDataCivil("America/Sao_Paulo", instante);
    expect(hojeSaoPaulo).toBe("2026-09-30");
    expect(hojeDataCivil("UTC", instante)).toBe("2026-10-01");

    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-10-31"), "mes", hojeSaoPaulo);
    // Setembro fecha inteiro como realizado; outubro inteiro como previsto.
    expect(periodos.map((p) => [p.rotulo, p.natureza])).toEqual([
      ["setembro de 2026", "realizado"],
      ["outubro de 2026", "previsto"],
    ]);
  });

  it("em UTC o mesmo instante quebraria outubro no dia 1 — por isso o fuso importa", () => {
    const instante = new Date("2026-10-01T01:00:00Z");
    const periodos = gerarPeriodos(dia("2026-09-01"), dia("2026-10-31"), "mes", hojeDataCivil("UTC", instante));
    expect(periodos.map((p) => p.rotulo)).toContain("outubro de 2026 · até hoje");
  });
});

describe("periodo padrao", () => {
  it("vai do inicio do mes passado ao fim do mes que vem", () => {
    expect(periodoPadrao(dia("2026-09-22"))).toEqual({ de: "2026-08-01", ate: "2026-10-31" });
  });

  it("atravessa a virada de ano", () => {
    expect(periodoPadrao(dia("2027-01-15"))).toEqual({ de: "2026-12-01", ate: "2027-02-28" });
  });
});
