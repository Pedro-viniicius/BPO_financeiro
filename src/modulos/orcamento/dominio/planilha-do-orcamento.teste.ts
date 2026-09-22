import { describe, expect, it } from "vitest";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import {
  anoZerado,
  compararComOOrcado,
  distribuirNoAno,
  estourou,
  MESES_DO_ANO,
  naturezaDoGrupo,
  percentualDeExecucao,
  proporcaoDaBarra,
  reajustar,
  repetirNosDozeMeses,
  somaDoAno,
} from "./planilha-do-orcamento";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);

describe("preencher o ano", () => {
  it("repetir poe o mesmo valor nos doze meses", () => {
    const ano = repetirNosDozeMeses(reais("1.500,00"));
    expect(ano).toHaveLength(MESES_DO_ANO);
    expect(ano.every((valor) => valor.igual(reais("1.500,00")))).toBe(true);
    expect(somaDoAno(ano).paraTexto()).toBe("18000.00");
  });

  it("distribuir divide o total e poe a sobra de centavos na ULTIMA parcela", () => {
    const ano = distribuirNoAno(reais("10.000,00"));
    expect(ano.slice(0, 11).every((valor) => valor.igual(reais("833,33")))).toBe(true);
    expect(ano[11]?.formatarBrasileiro()).toBe("R$ 833,37");
  });

  it("a soma dos doze meses bate exatamente com o total, sempre", () => {
    for (const total of ["10.000,00", "1,00", "7,77", "999.999,99", "12,00"]) {
      expect(somaDoAno(distribuirNoAno(reais(total))).paraTexto(), total).toBe(reais(total).paraTexto());
    }
  });

  it("distribuir valor divisivel deixa os doze meses iguais", () => {
    const ano = distribuirNoAno(reais("12.000,00"));
    expect(ano.every((valor) => valor.igual(reais("1.000,00")))).toBe(true);
  });

  it("ano zerado tem doze meses em branco", () => {
    expect(anoZerado()).toHaveLength(MESES_DO_ANO);
    expect(somaDoAno(anoZerado()).ehZero()).toBe(true);
  });
});

describe("reajuste ao copiar", () => {
  it("sem percentual devolve os mesmos valores", () => {
    const ano = repetirNosDozeMeses(reais("1.000,00"));
    expect(reajustar(ano, 0)).toBe(ano);
  });

  it("aplica o percentual mes a mes", () => {
    const ano = reajustar(repetirNosDozeMeses(reais("1.000,00")), 8);
    expect(ano[0]?.paraTexto()).toBe("1080.00");
    expect(somaDoAno(ano).paraTexto()).toBe("12960.00");
  });

  it("aceita reajuste negativo (corte de orcamento)", () => {
    expect(reajustar(repetirNosDozeMeses(reais("1.000,00")), -10)[0]?.paraTexto()).toBe("900.00");
  });
});

describe("estouro", () => {
  it("DESPESA estoura quando gasta mais do que o orcado", () => {
    expect(estourou(reais("1.000,00"), reais("1.200,00"), "despesa")).toBe(true);
    expect(estourou(reais("1.000,00"), reais("800,00"), "despesa")).toBe(false);
    expect(estourou(reais("1.000,00"), reais("1.000,00"), "despesa")).toBe(false);
  });

  it("RECEITA estoura quando fatura MENOS do que o orcado", () => {
    // Sem isso, faturar acima da meta apareceria como problema.
    expect(estourou(reais("10.000,00"), reais("8.000,00"), "receita")).toBe(true);
    expect(estourou(reais("10.000,00"), reais("12.000,00"), "receita")).toBe(false);
  });

  it("sem planejamento nao ha estouro: gastar fora do orcamento e outro aviso", () => {
    expect(estourou(Dinheiro.zero(), reais("500,00"), "despesa")).toBe(false);
    expect(estourou(Dinheiro.zero(), Dinheiro.zero(), "receita")).toBe(false);
  });
});

describe("execucao", () => {
  it("percentual e o realizado sobre o planejado", () => {
    expect(percentualDeExecucao(reais("1.000,00"), reais("750,00"))).toBe(75);
    expect(percentualDeExecucao(reais("1.000,00"), reais("1.250,00"))).toBe(125);
  });

  it("sem planejamento nao ha percentual: devolve nulo em vez de infinito", () => {
    expect(percentualDeExecucao(Dinheiro.zero(), reais("500,00"))).toBeNull();
  });

  it("a barra nunca passa de 100 nem fica negativa", () => {
    expect(proporcaoDaBarra(75)).toBe(75);
    expect(proporcaoDaBarra(180)).toBe(100);
    expect(proporcaoDaBarra(-20)).toBe(0);
    expect(proporcaoDaBarra(null)).toBe(0);
  });

  it("a comparacao devolve tudo de uma vez", () => {
    const execucao = compararComOOrcado(reais("1.000,00"), reais("1.200,00"), "despesa");
    expect(execucao.diferenca.paraTexto()).toBe("200.00");
    expect(execucao.execucao).toBe(120);
    expect(execucao.estourou).toBe(true);
  });

  it("receita abaixo da meta: diferenca negativa e estouro verdadeiro", () => {
    const execucao = compararComOOrcado(reais("10.000,00"), reais("8.000,00"), "receita");
    expect(execucao.diferenca.paraTexto()).toBe("-2000.00");
    expect(execucao.estourou).toBe(true);
  });
});

describe("natureza pelo grupo do plano", () => {
  it("receita bruta e receita; despesas e deducoes sao despesa", () => {
    expect(naturezaDoGrupo("receita_bruta")).toBe("receita");
    expect(naturezaDoGrupo("despesa_operacional")).toBe("despesa");
    expect(naturezaDoGrupo("deducao")).toBe("despesa");
    expect(naturezaDoGrupo("custo")).toBe("despesa");
    expect(naturezaDoGrupo("resultado_financeiro")).toBe("despesa");
  });

  it("transferencia nao se orca: nao e receita nem despesa", () => {
    expect(naturezaDoGrupo("transferencia")).toBeNull();
  });

  it("sem grupo, trata como despesa: errar para o lado que avisa", () => {
    expect(naturezaDoGrupo(null)).toBe("despesa");
  });
});
