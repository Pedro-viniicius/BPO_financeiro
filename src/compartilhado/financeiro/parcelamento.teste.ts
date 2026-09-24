import { describe, expect, it } from "vitest";

import { dataCivilDeTexto, type DataVencimento } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";
import {
  gerarParcelas,
  MAXIMO_PARCELAS,
  MINIMO_PARCELAS,
  type ParcelaPlanejada,
  validarPlanoDeParcelas,
} from "./parcelamento";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);
const dia = (texto: string) => dataCivilDeTexto(texto) as DataVencimento;

describe("gerarParcelas", () => {
  it("divide o total sem perder nem inventar centavo", () => {
    const parcelas = gerarParcelas({
      quantidade: 3,
      total: reais("1.000,00"),
      primeiroVencimento: dia("2026-10-10"),
      periodicidade: "mensal",
    });

    expect(parcelas.map((p) => p.valor.formatarBrasileiro())).toEqual(["R$\u00a0333,33", "R$\u00a0333,33", "R$\u00a0333,34"]);
    expect(Dinheiro.somarTodos(parcelas.map((p) => p.valor)).igual(reais("1.000,00"))).toBe(true);
  });

  it("poe a sobra de centavos na ULTIMA parcela", () => {
    const parcelas = gerarParcelas({
      quantidade: 7,
      total: reais("100,00"),
      primeiroVencimento: dia("2026-01-05"),
      periodicidade: "mensal",
    });

    // 100,00 / 7 = 14,285... -> 14,28 em seis parcelas e o resto na setima.
    expect(parcelas.slice(0, 6).every((p) => p.valor.igual(reais("14,28")))).toBe(true);
    expect(parcelas[6]!.valor.formatarBrasileiro()).toBe("R$\u00a014,32");
    expect(Dinheiro.somarTodos(parcelas.map((p) => p.valor)).igual(reais("100,00"))).toBe(true);
  });

  it("quando divide exato, todas as parcelas sao iguais", () => {
    const parcelas = gerarParcelas({
      quantidade: 4,
      total: reais("400,00"),
      primeiroVencimento: dia("2026-03-01"),
      periodicidade: "mensal",
    });
    expect(parcelas.every((p) => p.valor.igual(reais("100,00")))).toBe(true);
  });

  it("dia 31 cai no ultimo dia do mes que nao tem 31, e volta depois", () => {
    const parcelas = gerarParcelas({
      quantidade: 4,
      total: reais("400,00"),
      primeiroVencimento: dia("2026-01-31"),
      periodicidade: "mensal",
    });

    expect(parcelas.map((p) => p.dataVencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeita 29 de fevereiro em ano bissexto", () => {
    const parcelas = gerarParcelas({
      quantidade: 2,
      total: reais("200,00"),
      primeiroVencimento: dia("2028-01-31"),
      periodicidade: "mensal",
    });
    expect(parcelas[1]!.dataVencimento).toBe("2028-02-29");
  });

  it("numera as parcelas a partir de 1", () => {
    const parcelas = gerarParcelas({
      quantidade: 3,
      total: reais("90,00"),
      primeiroVencimento: dia("2026-05-10"),
      periodicidade: "mensal",
    });
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it("aplica cada periodicidade ao vencimento", () => {
    const base = { quantidade: 2, total: reais("100,00"), primeiroVencimento: dia("2026-01-10") };
    const segundoVencimento = (periodicidade: Parameters<typeof gerarParcelas>[0]["periodicidade"]) =>
      gerarParcelas({ ...base, periodicidade })[1]!.dataVencimento;

    expect(segundoVencimento("semanal")).toBe("2026-01-17");
    expect(segundoVencimento("quinzenal")).toBe("2026-01-24");
    expect(segundoVencimento("mensal")).toBe("2026-02-10");
    expect(segundoVencimento("bimestral")).toBe("2026-03-10");
    expect(segundoVencimento("trimestral")).toBe("2026-04-10");
    expect(segundoVencimento("semestral")).toBe("2026-07-10");
    expect(segundoVencimento("anual")).toBe("2027-01-10");
  });

  it("recusa quantidade ou total invalidos", () => {
    const base = { total: reais("100,00"), primeiroVencimento: dia("2026-01-10"), periodicidade: "mensal" as const };
    expect(() => gerarParcelas({ ...base, quantidade: 0 })).toThrow(RangeError);
    expect(() => gerarParcelas({ ...base, quantidade: 2.5 })).toThrow(RangeError);
    expect(() => gerarParcelas({ ...base, quantidade: 2, total: Dinheiro.zero() })).toThrow(RangeError);
  });
});

describe("validarPlanoDeParcelas", () => {
  const plano = (valores: readonly string[]): ParcelaPlanejada[] =>
    valores.map((valor, indice) => ({
      numero: indice + 1,
      dataVencimento: dia(`2026-0${indice + 1}-10`),
      valor: reais(valor),
    }));

  it("aceita o plano cuja soma bate exatamente com o total", () => {
    const resultado = validarPlanoDeParcelas(plano(["333,33", "333,33", "333,34"]), reais("1.000,00"));
    expect(resultado.sucesso).toBe(true);
  });

  it("recusa quando falta um centavo", () => {
    const resultado = validarPlanoDeParcelas(plano(["333,33", "333,33", "333,33"]), reais("1.000,00"));
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) expect(resultado.erro.message).toContain("igual ao total");
  });

  it("recusa quando sobra um centavo", () => {
    const resultado = validarPlanoDeParcelas(plano(["333,34", "333,34", "333,34"]), reais("1.000,00"));
    expect(resultado.sucesso).toBe(false);
  });

  it("aceita parcelas com valores editados, desde que a soma feche", () => {
    const resultado = validarPlanoDeParcelas(plano(["500,00", "300,00", "200,00"]), reais("1.000,00"));
    expect(resultado.sucesso).toBe(true);
  });

  it("recusa parcela com valor zero ou negativo", () => {
    const resultado = validarPlanoDeParcelas(plano(["1.000,00", "0,00"]), reais("1.000,00"));
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) expect(resultado.erro.message).toContain("maior que zero");
  });

  it("recusa menos que o minimo e mais que o maximo", () => {
    expect(validarPlanoDeParcelas(plano(["100,00"]), reais("100,00")).sucesso).toBe(false);

    const demais = Array.from({ length: MAXIMO_PARCELAS + 1 }, (_, i) => ({
      numero: i + 1,
      dataVencimento: dia("2026-01-10"),
      valor: reais("1,00"),
    }));
    expect(validarPlanoDeParcelas(demais, Dinheiro.deTextoBrasileiro(`${MAXIMO_PARCELAS + 1},00`)).sucesso).toBe(false);
  });

  it("o minimo e o maximo sao os do enunciado do produto", () => {
    expect(MINIMO_PARCELAS).toBe(2);
    expect(MAXIMO_PARCELAS).toBe(120);
  });
});
