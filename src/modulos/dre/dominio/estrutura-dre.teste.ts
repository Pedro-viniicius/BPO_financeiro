import { describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import {
  calcularSubtotais,
  contribuicaoNaLinha,
  ESTRUTURA_DRE,
  linhaDoLancamento,
  margemPercentual,
  variacaoPercentual,
  type LinhaDre,
} from "./estrutura-dre";
import { intervaloDoAtalho, MAXIMO_DE_MESES, mesesDoPeriodo } from "./periodo-do-resultado";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);
const dia = (texto: string) => dataCivilDeTexto(texto);

describe("para que linha vai cada lancamento", () => {
  it("cada grupo do plano cai na sua linha", () => {
    expect(linhaDoLancamento("receita_bruta", "entrada")).toBe("receita_bruta");
    expect(linhaDoLancamento("deducao", "saida")).toBe("deducoes");
    expect(linhaDoLancamento("custo", "saida")).toBe("custos");
    expect(linhaDoLancamento("despesa_operacional", "saida")).toBe("despesas_operacionais");
  });

  it("resultado financeiro se divide pelo SENTIDO: rendimento e receita, tarifa e despesa", () => {
    expect(linhaDoLancamento("resultado_financeiro", "entrada")).toBe("receitas_financeiras");
    expect(linhaDoLancamento("resultado_financeiro", "saida")).toBe("despesas_financeiras");
  });

  it("transferencia entre contas proprias NAO entra no resultado", () => {
    expect(linhaDoLancamento("transferencia", "entrada")).toBeNull();
    expect(linhaDoLancamento("transferencia", "saida")).toBeNull();
  });

  it("sem categoria, cai em nao operacional em vez de sumir", () => {
    // Um valor que desaparece do demonstrativo e pior do que um mal
    // classificado: ninguem procura o que nao sabe que falta.
    expect(linhaDoLancamento(null, "saida")).toBe("nao_operacional");
  });
});

describe("contribuicao de cada lancamento na sua linha", () => {
  it("receita: entrada soma, saida (devolucao) diminui", () => {
    expect(contribuicaoNaLinha("receita_bruta", "entrada", reais("1.000,00")).paraTexto()).toBe("1000.00");
    expect(contribuicaoNaLinha("receita_bruta", "saida", reais("1.000,00")).paraTexto()).toBe("-1000.00");
  });

  it("despesa: saida soma, entrada (reembolso) diminui", () => {
    expect(contribuicaoNaLinha("despesas_operacionais", "saida", reais("300,00")).paraTexto()).toBe("300.00");
    expect(contribuicaoNaLinha("despesas_operacionais", "entrada", reais("300,00")).paraTexto()).toBe("-300.00");
  });

  it("deducao guarda valor positivo, e o sinal de menos esta no rotulo", () => {
    expect(contribuicaoNaLinha("deducoes", "saida", reais("90,00")).paraTexto()).toBe("90.00");
    expect(ESTRUTURA_DRE.find((l) => l.linha === "deducoes")?.rotulo).toContain("(−)");
  });
});

describe("subtotais", () => {
  const montar = (valores: Partial<Record<LinhaDre, string>>) =>
    calcularSubtotais(
      new Map(Object.entries(valores).map(([linha, valor]) => [linha as LinhaDre, reais(valor!)])),
    );

  it("receita liquida = bruta menos deducoes menos descontos concedidos", () => {
    const dre = montar({ receita_bruta: "10.000,00", deducoes: "900,00", descontos_concedidos: "100,00" });
    expect(dre.get("receita_liquida")?.paraTexto()).toBe("9000.00");
  });

  it("resultado operacional = receita liquida menos custos e despesas", () => {
    const dre = montar({
      receita_bruta: "10.000,00",
      deducoes: "900,00",
      descontos_concedidos: "100,00",
      custos: "2.000,00",
      despesas_operacionais: "4.000,00",
    });
    expect(dre.get("resultado_operacional")?.paraTexto()).toBe("3000.00");
  });

  it("resultado do periodo fecha com as linhas financeiras e o nao operacional", () => {
    const dre = montar({
      receita_bruta: "10.000,00",
      deducoes: "900,00",
      descontos_concedidos: "100,00",
      custos: "2.000,00",
      despesas_operacionais: "4.000,00",
      receitas_financeiras: "50,00",
      despesas_financeiras: "80,00",
      descontos_obtidos: "30,00",
      nao_operacional: "200,00",
    });
    // 3.000 + 50 − 80 + 30 + 200
    expect(dre.get("resultado_periodo")?.paraTexto()).toBe("3200.00");
  });

  it("nao operacional negativo (uma perda) reduz o resultado", () => {
    const dre = montar({ receita_bruta: "1.000,00", nao_operacional: "-300,00" });
    expect(dre.get("resultado_periodo")?.paraTexto()).toBe("700.00");
  });

  it("demonstrativo vazio devolve tudo zerado, nao indefinido", () => {
    const dre = calcularSubtotais(new Map());
    for (const definicao of ESTRUTURA_DRE) {
      expect(dre.get(definicao.linha)?.paraTexto(), definicao.linha).toBe("0.00");
    }
  });

  it("prejuizo aparece como resultado negativo", () => {
    const dre = montar({ receita_bruta: "1.000,00", despesas_operacionais: "1.500,00" });
    expect(dre.get("resultado_periodo")?.paraTexto()).toBe("-500.00");
    expect(dre.get("resultado_periodo")?.ehNegativo()).toBe(true);
  });
});

describe("margem e variacao", () => {
  it("margem e o resultado sobre a receita liquida", () => {
    expect(margemPercentual(reais("3.000,00"), reais("10.000,00"))).toBe(30);
    expect(margemPercentual(reais("-500,00"), reais("1.000,00"))).toBe(-50);
  });

  it("sem receita nao ha margem: devolve nulo em vez de infinito", () => {
    expect(margemPercentual(reais("100,00"), Dinheiro.zero())).toBeNull();
  });

  it("variacao compara com o mes anterior", () => {
    expect(variacaoPercentual(reais("1.200,00"), reais("1.000,00"))).toBe(20);
    expect(variacaoPercentual(reais("800,00"), reais("1.000,00"))).toBe(-20);
  });

  it("variacao sobre base negativa usa o modulo, para o sinal fazer sentido", () => {
    // Sair de −1.000 para −500 e uma MELHORA de 50%, nao uma piora.
    expect(variacaoPercentual(reais("-500,00"), reais("-1.000,00"))).toBe(50);
  });

  it("sem mes anterior nao ha variacao", () => {
    expect(variacaoPercentual(reais("100,00"), Dinheiro.zero())).toBeNull();
  });
});

describe("meses do periodo", () => {
  it("quebra o intervalo em meses, com rotulos legiveis", () => {
    const meses = mesesDoPeriodo(dia("2026-08-01"), dia("2026-10-31"));
    expect(meses.map((m) => m.competencia)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(meses[1]?.rotulo).toBe("setembro/2026");
    expect(meses[1]?.rotuloCurto).toBe("set/26");
  });

  it("o primeiro e o ultimo mes sao recortados pelo periodo pedido", () => {
    const meses = mesesDoPeriodo(dia("2026-09-10"), dia("2026-10-20"));
    expect(meses[0]).toMatchObject({ inicio: "2026-09-10", fim: "2026-09-30" });
    expect(meses[1]).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-20" });
  });

  it("atravessa a virada de ano", () => {
    const meses = mesesDoPeriodo(dia("2026-11-01"), dia("2027-02-28"));
    expect(meses.map((m) => m.competencia)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("intervalo invertido devolve vazio em vez de laco infinito", () => {
    expect(mesesDoPeriodo(dia("2026-10-01"), dia("2026-09-01"))).toEqual([]);
  });

  it("intervalo absurdo e cortado, nao trava a pagina", () => {
    expect(mesesDoPeriodo(dia("2000-01-01"), dia("2099-12-31")).length).toBe(MAXIMO_DE_MESES);
  });
});

describe("atalhos de periodo", () => {
  const hoje = dia("2026-09-22");

  it("mes atual vai do dia 1 ao ultimo dia", () => {
    expect(intervaloDoAtalho("mes_atual", hoje)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
  });

  it("mes anterior", () => {
    expect(intervaloDoAtalho("mes_anterior", hoje)).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
  });

  it("trimestre: os tres ultimos meses, incluindo o atual", () => {
    expect(intervaloDoAtalho("trimestre", hoje)).toEqual({ de: "2026-07-01", ate: "2026-09-30" });
  });

  it("ano corrente vai de janeiro a dezembro", () => {
    expect(intervaloDoAtalho("ano", hoje)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
  });

  it("mes anterior atravessa a virada de ano", () => {
    expect(intervaloDoAtalho("mes_anterior", dia("2027-01-15"))).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
  });
});
