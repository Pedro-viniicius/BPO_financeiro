import { describe, expect, it } from "vitest";

import { Dinheiro } from "./dinheiro";
import { Percentual } from "./percentual";

describe("Dinheiro", () => {
  it("cria a partir de texto canonico e devolve o mesmo texto", () => {
    expect(Dinheiro.deTexto("1234.56").paraTexto()).toBe("1234.56");
    expect(Dinheiro.deTexto("10").paraTexto()).toBe("10.00");
    expect(Dinheiro.deTexto("-0.5").paraTexto()).toBe("-0.50");
    expect(Dinheiro.deTexto("0").centavos).toBe(0n);
  });

  it("cria a partir de texto brasileiro", () => {
    expect(Dinheiro.deTextoBrasileiro("1.234,56").paraTexto()).toBe("1234.56");
    expect(Dinheiro.deTextoBrasileiro("R$ 10,00").paraTexto()).toBe("10.00");
    expect(Dinheiro.deTextoBrasileiro("-2,5").paraTexto()).toBe("-2.50");
  });

  it("rejeita mais casas decimais do que a moeda permite", () => {
    expect(() => Dinheiro.deTexto("1.005")).toThrow(RangeError);
  });

  it("soma e subtrai sem perder centavos (o classico 0,1 + 0,2)", () => {
    const resultado = Dinheiro.deTexto("0.10").somar(Dinheiro.deTexto("0.20"));
    expect(resultado.paraTexto()).toBe("0.30");
    expect(Dinheiro.deTexto("100.00").subtrair(Dinheiro.deTexto("100.01")).paraTexto()).toBe("-0.01");
  });

  it("soma uma lista", () => {
    const total = Dinheiro.somarTodos([Dinheiro.deTexto("1.10"), Dinheiro.deTexto("2.20"), Dinheiro.deTexto("3.30")]);
    expect(total.paraTexto()).toBe("6.60");
  });

  it("aplica percentual com arredondamento comercial por padrao", () => {
    // 2% de 10,25 = 0,205 -> 0,21 (meio para cima)
    expect(Dinheiro.deTexto("10.25").aplicarPercentual(Percentual.de("2")).paraTexto()).toBe("0.21");
    // mesmo caso truncando
    expect(Dinheiro.deTexto("10.25").aplicarPercentual(Percentual.de("2"), "para-baixo").paraTexto()).toBe("0.20");
    // valor negativo arredonda afastando-se do zero
    expect(Dinheiro.deTexto("-10.25").aplicarPercentual(Percentual.de("2")).paraTexto()).toBe("-0.21");
  });

  it("multiplica por fator decimal", () => {
    expect(Dinheiro.deTexto("100.00").multiplicarPorFator("1.5").paraTexto()).toBe("150.00");
    expect(Dinheiro.deTexto("10.00").multiplicarPorFator("0.333").paraTexto()).toBe("3.33");
    expect(Dinheiro.deTexto("10.00").multiplicarPorInteiro(3).paraTexto()).toBe("30.00");
  });

  it("divide em parcelas cuja soma bate exatamente com o total", () => {
    const parcelas = Dinheiro.deTexto("100.00").dividirEmParcelas(3);
    expect(parcelas.map((p) => p.paraTexto())).toEqual(["33.34", "33.33", "33.33"]);
    expect(Dinheiro.somarTodos(parcelas).paraTexto()).toBe("100.00");

    const negativas = Dinheiro.deTexto("-10.00").dividirEmParcelas(3);
    expect(negativas.map((p) => p.paraTexto())).toEqual(["-3.34", "-3.33", "-3.33"]);
  });

  it("calcula percentual sobre uma base (margem)", () => {
    const lucro = Dinheiro.deTexto("37.00");
    const receita = Dinheiro.deTexto("100.00");
    expect(lucro.percentualSobre(receita).formatarBrasileiro()).toBe("37,0%");
    expect(Dinheiro.deTexto("1.00").percentualSobre(Dinheiro.deTexto("3.00")).paraTexto()).toBe("33.3333");
  });

  it("compara valores", () => {
    const a = Dinheiro.deTexto("1.00");
    const b = Dinheiro.deTexto("2.00");
    expect(a.menorQue(b)).toBe(true);
    expect(b.maiorQue(a)).toBe(true);
    expect(a.igual(Dinheiro.deTexto("1.00"))).toBe(true);
    expect(Dinheiro.zero().ehZero()).toBe(true);
    expect(a.negar().ehNegativo()).toBe(true);
  });

  it("formata para exibicao em portugues do Brasil", () => {
    expect(Dinheiro.deTexto("1234567.89").formatarBrasileiro()).toBe("R$ 1.234.567,89");
    expect(Dinheiro.deTexto("0.05").formatarBrasileiro()).toBe("R$ 0,05");
    expect(Dinheiro.deTexto("-1000").formatarBrasileiro()).toBe("-R$ 1.000,00");
  });

  it("serializa para JSON com valor em texto e moeda", () => {
    expect(JSON.parse(JSON.stringify(Dinheiro.deTexto("9.99")))).toEqual({ valor: "9.99", moeda: "BRL" });
  });
});

describe("Percentual", () => {
  it("interpreta e formata", () => {
    expect(Percentual.de("5").paraTexto()).toBe("5.0000");
    expect(Percentual.de("5.25").formatarBrasileiro()).toBe("5,25%");
    expect(Percentual.de("0").formatarBrasileiro()).toBe("0,0%");
  });

  it("rejeita mais de 4 casas", () => {
    expect(() => Percentual.de("1.00001")).toThrow(RangeError);
  });

  it("soma e subtrai", () => {
    expect(Percentual.de("10").somar(Percentual.de("2.5")).paraTexto()).toBe("12.5000");
    expect(Percentual.de("10").subtrair(Percentual.de("12")).ehNegativo()).toBe(true);
  });
});
