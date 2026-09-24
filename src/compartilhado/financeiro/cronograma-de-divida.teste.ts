import { describe, expect, it } from "vitest";

import { dataCivilDeTexto, type DataVencimento } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";

import {
  gerarCronograma,
  MAXIMO_PARCELAS_DIVIDA,
  prestacaoPrice,
  saldoApos,
  taxaAnualParaMensal,
  taxaMensalParaAnual,
  totalDeJuros,
  validarCronograma,
  type ParcelaDoCronograma,
} from "./cronograma-de-divida";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);
const dia = (texto: string) => dataCivilDeTexto(texto) as DataVencimento;

const PLANO_BASE = {
  valorPrincipal: reais("12.000,00"),
  taxaMensal: 2,
  quantidadeParcelas: 12,
  primeiroVencimento: dia("2026-10-10"),
};

/**
 * TABELA DE REFERENCIA — Price, R$ 12.000,00, 2% a.m., 12 parcelas.
 *
 * Calculada A PARTE, com aritmetica decimal exata (Python `decimal`,
 * arredondamento comercial ao centavo), e nao pelo codigo que este arquivo
 * testa. Conferir o codigo contra ele mesmo nao prova nada.
 *
 *   PMT = PV × i / (1 − (1+i)^−n) = 12.000 × 0,02 / (1 − 1,02^−12) = 1.134,72
 *
 *    n |    juros |   amort. |    total |     saldo
 *    1 |   240,00 |   894,72 | 1.134,72 | 11.105,28
 *    2 |   222,11 |   912,61 | 1.134,72 | 10.192,67
 *    3 |   203,85 |   930,87 | 1.134,72 |  9.261,80
 *    4 |   185,24 |   949,48 | 1.134,72 |  8.312,32
 *    5 |   166,25 |   968,47 | 1.134,72 |  7.343,85
 *    6 |   146,88 |   987,84 | 1.134,72 |  6.356,01
 *    7 |   127,12 | 1.007,60 | 1.134,72 |  5.348,41
 *    8 |   106,97 | 1.027,75 | 1.134,72 |  4.320,66
 *    9 |    86,41 | 1.048,31 | 1.134,72 |  3.272,35
 *   10 |    65,45 | 1.069,27 | 1.134,72 |  2.203,08
 *   11 |    44,06 | 1.090,66 | 1.134,72 |  1.112,42
 *   12 |    22,25 | 1.112,42 | 1.134,67 |      0,00
 *
 *   total de juros 1.616,59 · soma das amortizacoes 12.000,00
 */
const REFERENCIA_PRICE = [
  ["240.00", "894.72", "1134.72", "11105.28"],
  ["222.11", "912.61", "1134.72", "10192.67"],
  ["203.85", "930.87", "1134.72", "9261.80"],
  ["185.24", "949.48", "1134.72", "8312.32"],
  ["166.25", "968.47", "1134.72", "7343.85"],
  ["146.88", "987.84", "1134.72", "6356.01"],
  ["127.12", "1007.60", "1134.72", "5348.41"],
  ["106.97", "1027.75", "1134.72", "4320.66"],
  ["86.41", "1048.31", "1134.72", "3272.35"],
  ["65.45", "1069.27", "1134.72", "2203.08"],
  ["44.06", "1090.66", "1134.72", "1112.42"],
  ["22.25", "1112.42", "1134.67", "0.00"],
] as const;

/**
 * TABELA DE REFERENCIA — SAC, mesmos R$ 12.000,00, 2% a.m., 12 parcelas.
 *
 *   amortizacao fixa = 12.000 / 12 = 1.000,00
 *
 *    n |    juros |   amort. |    total |     saldo
 *    1 |   240,00 | 1.000,00 | 1.240,00 | 11.000,00
 *    2 |   220,00 | 1.000,00 | 1.220,00 | 10.000,00
 *    ...(juros caem R$ 20,00 por mes)
 *   12 |    20,00 | 1.000,00 | 1.020,00 |      0,00
 *
 *   total de juros 1.560,00 — R$ 56,59 a menos que o Price, porque o saldo
 *   cai mais rapido.
 */
const REFERENCIA_SAC = Array.from({ length: 12 }, (_, indice) => {
  const saldoAntes = 12000 - indice * 1000;
  return [
    (saldoAntes * 0.02).toFixed(2),
    "1000.00",
    (saldoAntes * 0.02 + 1000).toFixed(2),
    (saldoAntes - 1000).toFixed(2),
  ] as const;
});

describe("Price, contra a tabela de referencia", () => {
  const parcelas = gerarCronograma({ ...PLANO_BASE, sistema: "price" });

  it("a prestacao e R$ 1.134,72", () => {
    expect(prestacaoPrice(reais("12.000,00"), 0.02, 12).paraTexto()).toBe("1134.72");
  });

  it("gera as doze parcelas", () => {
    expect(parcelas).toHaveLength(12);
  });

  it.each(REFERENCIA_PRICE.map((linha, indice) => [indice + 1, ...linha] as const))(
    "parcela %i: juros %s, amortizacao %s, total %s, saldo %s",
    (numero, juros, amortizacao, total, saldo) => {
      const parcela = parcelas[Number(numero) - 1]!;
      expect(parcela.valorJuros.paraTexto()).toBe(juros);
      expect(parcela.valorAmortizacao.paraTexto()).toBe(amortizacao);
      expect(parcela.valorTotal.paraTexto()).toBe(total);
      expect(parcela.saldoDevedor.paraTexto()).toBe(saldo);
    },
  );

  it("a parcela e constante, menos a ultima, que absorve os centavos", () => {
    const iguais = parcelas.slice(0, 11).every((parcela) => parcela.valorTotal.paraTexto() === "1134.72");
    expect(iguais).toBe(true);
    expect(parcelas[11]?.valorTotal.paraTexto()).toBe("1134.67");
  });

  it("o total de juros bate com a referencia", () => {
    expect(totalDeJuros(parcelas).paraTexto()).toBe("1616.59");
  });

  it("os juros CAEM e a amortizacao SOBE ao longo do contrato", () => {
    for (let i = 1; i < parcelas.length; i++) {
      expect(parcelas[i]!.valorJuros.menorQue(parcelas[i - 1]!.valorJuros), `juros na parcela ${i + 1}`).toBe(true);
      expect(parcelas[i]!.valorAmortizacao.maiorQue(parcelas[i - 1]!.valorAmortizacao)).toBe(true);
    }
  });
});

describe("SAC, contra a tabela de referencia", () => {
  const parcelas = gerarCronograma({ ...PLANO_BASE, sistema: "sac" });

  it.each(REFERENCIA_SAC.map((linha, indice) => [indice + 1, ...linha] as const))(
    "parcela %i: juros %s, amortizacao %s, total %s, saldo %s",
    (numero, juros, amortizacao, total, saldo) => {
      const parcela = parcelas[Number(numero) - 1]!;
      expect(parcela.valorJuros.paraTexto()).toBe(juros);
      expect(parcela.valorAmortizacao.paraTexto()).toBe(amortizacao);
      expect(parcela.valorTotal.paraTexto()).toBe(total);
      expect(parcela.saldoDevedor.paraTexto()).toBe(saldo);
    },
  );

  it("a amortizacao e constante e a parcela CAI todo mes", () => {
    expect(parcelas.every((parcela) => parcela.valorAmortizacao.paraTexto() === "1000.00")).toBe(true);
    for (let i = 1; i < parcelas.length; i++) {
      expect(parcelas[i]!.valorTotal.menorQue(parcelas[i - 1]!.valorTotal)).toBe(true);
    }
  });

  it("SAC paga menos juros que Price no mesmo contrato", () => {
    const price = totalDeJuros(gerarCronograma({ ...PLANO_BASE, sistema: "price" }));
    expect(totalDeJuros(parcelas).paraTexto()).toBe("1560.00");
    expect(totalDeJuros(parcelas).menorQue(price)).toBe(true);
  });
});

describe("a divida sempre fecha em zero", () => {
  const casos = [
    { valor: "12.000,00", taxa: 2, parcelas: 12 },
    { valor: "10.000,00", taxa: 1.5, parcelas: 36 },
    { valor: "7.777,77", taxa: 0.99, parcelas: 7 },
    { valor: "1.000,00", taxa: 0, parcelas: 3 },
    { valor: "250.000,00", taxa: 1.2, parcelas: 120 },
    { valor: "0,03", taxa: 5, parcelas: 3 },
  ];

  it.each(casos)("Price: $valor a $taxa% em $parcelas vezes", ({ valor, taxa, parcelas }) => {
    const cronograma = gerarCronograma({
      valorPrincipal: reais(valor),
      taxaMensal: taxa,
      quantidadeParcelas: parcelas,
      primeiroVencimento: dia("2026-10-10"),
      sistema: "price",
    });
    const soma = Dinheiro.somarTodos(cronograma.map((p) => p.valorAmortizacao));
    expect(soma.paraTexto()).toBe(reais(valor).paraTexto());
    expect(cronograma.at(-1)?.saldoDevedor.ehZero()).toBe(true);
  });

  it.each(casos)("SAC: $valor a $taxa% em $parcelas vezes", ({ valor, taxa, parcelas }) => {
    const cronograma = gerarCronograma({
      valorPrincipal: reais(valor),
      taxaMensal: taxa,
      quantidadeParcelas: parcelas,
      primeiroVencimento: dia("2026-10-10"),
      sistema: "sac",
    });
    const soma = Dinheiro.somarTodos(cronograma.map((p) => p.valorAmortizacao));
    expect(soma.paraTexto()).toBe(reais(valor).paraTexto());
    expect(cronograma.at(-1)?.saldoDevedor.ehZero()).toBe(true);
  });
});

describe("vencimentos", () => {
  it("avancam de mes em mes a partir do primeiro", () => {
    const parcelas = gerarCronograma({ ...PLANO_BASE, quantidadeParcelas: 3, sistema: "price" });
    expect(parcelas.map((p) => p.dataVencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
  });

  it("dia 31 cai no ultimo dia do mes que nao tem 31", () => {
    const parcelas = gerarCronograma({
      ...PLANO_BASE,
      quantidadeParcelas: 4,
      primeiroVencimento: dia("2026-01-31"),
      sistema: "sac",
    });
    expect(parcelas.map((p) => p.dataVencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("taxa sem juros e conversoes", () => {
  it("taxa zero divide o valor igualmente, sem juros nenhum", () => {
    const parcelas = gerarCronograma({
      valorPrincipal: reais("1.200,00"),
      taxaMensal: 0,
      quantidadeParcelas: 12,
      primeiroVencimento: dia("2026-10-10"),
      sistema: "price",
    });
    expect(parcelas.every((p) => p.valorJuros.ehZero())).toBe(true);
    expect(parcelas.every((p) => p.valorTotal.paraTexto() === "100.00")).toBe(true);
    expect(totalDeJuros(parcelas).ehZero()).toBe(true);
  });

  it("anual vira mensal EQUIVALENTE, nao anual dividido por doze", () => {
    // 26,824179% a.a. sao exatamente 2% a.m. compostos. A divisao simples
    // daria 2,235%, e a diferenca aparece inteira no total pago.
    expect(taxaAnualParaMensal(26.824179)).toBeCloseTo(2, 3);
    expect(26.824179 / 12).toBeCloseTo(2.235, 2);
  });

  it("a volta bate: mensal -> anual -> mensal", () => {
    expect(taxaMensalParaAnual(2)).toBeCloseTo(26.8242, 3);
    expect(taxaAnualParaMensal(taxaMensalParaAnual(2))).toBeCloseTo(2, 3);
  });

  it("taxa zero atravessa as conversoes", () => {
    expect(taxaAnualParaMensal(0)).toBe(0);
    expect(taxaMensalParaAnual(0)).toBe(0);
  });
});

describe("validacao do cronograma", () => {
  const cronograma = gerarCronograma({ ...PLANO_BASE, sistema: "price" });

  it("aceita o cronograma gerado", () => {
    expect(validarCronograma(cronograma, reais("12.000,00")).sucesso).toBe(true);
  });

  it("RECUSA quando a soma das amortizacoes nao bate com o contratado", () => {
    const adulterado: ParcelaDoCronograma[] = cronograma.map((parcela, indice) =>
      indice === 0
        ? { ...parcela, valorAmortizacao: parcela.valorAmortizacao.somar(reais("1,00")), valorTotal: parcela.valorTotal.somar(reais("1,00")) }
        : parcela,
    );
    const resultado = validarCronograma(adulterado, reais("12.000,00"));
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.erro.message).toContain("R$\u00a012.001,00");
      expect(resultado.erro.message).toContain("R$\u00a012.000,00");
    }
  });

  it("RECUSA parcela cujo total nao e amortizacao mais juros", () => {
    const adulterado = cronograma.map((parcela, indice) =>
      indice === 2 ? { ...parcela, valorTotal: reais("999,00") } : parcela,
    );
    const resultado = validarCronograma(adulterado, reais("12.000,00"));
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) expect(resultado.erro.message).toContain("parcela 3");
  });

  it("RECUSA parcela zerada ou negativa", () => {
    const zerada = cronograma.map((parcela, indice) =>
      indice === 0
        ? { ...parcela, valorAmortizacao: Dinheiro.zero(), valorJuros: Dinheiro.zero(), valorTotal: Dinheiro.zero() }
        : parcela,
    );
    expect(validarCronograma(zerada, reais("12.000,00")).sucesso).toBe(false);
  });

  it("RECUSA cronograma vazio ou grande demais", () => {
    expect(validarCronograma([], reais("100,00")).sucesso).toBe(false);
    const gigante = Array.from({ length: MAXIMO_PARCELAS_DIVIDA + 1 }, (_, indice) => ({
      numero: indice + 1,
      dataVencimento: dia("2026-10-10"),
      valorAmortizacao: reais("1,00"),
      valorJuros: Dinheiro.zero(),
      valorTotal: reais("1,00"),
      saldoDevedor: Dinheiro.zero(),
    }));
    expect(validarCronograma(gigante, reais("481,00")).sucesso).toBe(false);
  });

  it("aceita cronograma informado a mao, desde que a soma feche", () => {
    const manual: ParcelaDoCronograma[] = [
      { numero: 1, dataVencimento: dia("2026-10-10"), valorAmortizacao: reais("5.000,00"), valorJuros: reais("100,00"), valorTotal: reais("5.100,00"), saldoDevedor: reais("7.000,00") },
      { numero: 2, dataVencimento: dia("2026-12-10"), valorAmortizacao: reais("7.000,00"), valorJuros: reais("50,00"), valorTotal: reais("7.050,00"), saldoDevedor: Dinheiro.zero() },
    ];
    expect(validarCronograma(manual, reais("12.000,00")).sucesso).toBe(true);
  });
});

describe("entradas invalidas", () => {
  it("recusa quantidade de parcelas fora do intervalo", () => {
    expect(() => gerarCronograma({ ...PLANO_BASE, quantidadeParcelas: 0, sistema: "price" })).toThrow(RangeError);
    expect(() => gerarCronograma({ ...PLANO_BASE, quantidadeParcelas: 1000, sistema: "price" })).toThrow(RangeError);
    expect(() => gerarCronograma({ ...PLANO_BASE, quantidadeParcelas: 2.5, sistema: "price" })).toThrow(RangeError);
  });

  it("recusa valor e taxa invalidos", () => {
    expect(() => gerarCronograma({ ...PLANO_BASE, valorPrincipal: Dinheiro.zero(), sistema: "price" })).toThrow(RangeError);
    expect(() => gerarCronograma({ ...PLANO_BASE, taxaMensal: -1, sistema: "price" })).toThrow(RangeError);
  });
});

describe("saldo devedor", () => {
  it("cai a cada amortizacao paga", () => {
    expect(saldoApos(reais("12.000,00"), [reais("894,72"), reais("912,61")]).paraTexto()).toBe("10192.67");
  });

  it("nunca fica negativo", () => {
    expect(saldoApos(reais("100,00"), [reais("150,00")]).ehZero()).toBe(true);
  });

  it("sem pagamento nenhum, e o valor contratado", () => {
    expect(saldoApos(reais("12.000,00"), []).paraTexto()).toBe("12000.00");
  });
});
