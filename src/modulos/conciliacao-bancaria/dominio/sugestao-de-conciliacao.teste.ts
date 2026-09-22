import { describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import {
  confiancaDeConciliacaoManual,
  JANELA_DE_DIAS,
  sugerirConciliacoes,
  validarConciliacao,
  type ItemParaCasar,
  type MovimentacaoParaCasar,
} from "./sugestao-de-conciliacao";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);

const item = (id: string, data: string, tipo: "entrada" | "saida", valor: string): ItemParaCasar => ({
  id,
  data: dataCivilDeTexto(data),
  tipo,
  valor: reais(valor),
});

const movimentacao = (id: string, data: string, tipo: "entrada" | "saida", valor: string): MovimentacaoParaCasar => ({
  id,
  data: dataCivilDeTexto(data),
  tipo,
  valor: reais(valor),
});

describe("sugestao de conciliacao", () => {
  it("casa mesmo sentido, mesmo valor e mesma data: sugestao exata", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "1.000,00")],
      [movimentacao("m1", "2026-09-10", "saida", "1.000,00")],
    );

    expect(sugestao?.candidatas.map((c) => c.movimentacaoId)).toEqual(["m1"]);
    expect(sugestao?.confianca).toBe("alta");
    expect(sugestao?.exata).toBe(true);
  });

  it("data proxima dentro da janela e 'possivel', nao exata", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "1.000,00")],
      [movimentacao("m1", "2026-09-08", "saida", "1.000,00")],
    );

    expect(sugestao?.confianca).toBe("possivel");
    expect(sugestao?.exata).toBe(false);
    expect(sugestao?.candidatas[0]?.diferencaDeDias).toBe(-2);
  });

  it("fora da janela de dias nao e candidata", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "1.000,00")],
      [movimentacao("m1", "2026-09-14", "saida", "1.000,00")],
    );
    expect(sugestao?.candidatas).toEqual([]);
    expect(sugestao?.confianca).toBe("revisao");
  });

  it("o limite da janela entra; um dia alem, nao", () => {
    const dentro = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "10,00")],
      [movimentacao("m1", `2026-09-${10 + JANELA_DE_DIAS}`, "saida", "10,00")],
    );
    expect(dentro[0]?.candidatas).toHaveLength(1);

    const fora = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "10,00")],
      [movimentacao("m1", `2026-09-${11 + JANELA_DE_DIAS}`, "saida", "10,00")],
    );
    expect(fora[0]?.candidatas).toHaveLength(0);
  });

  it("valor diferente nao casa, nem por um centavo", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "1.000,00")],
      [movimentacao("m1", "2026-09-10", "saida", "1.000,01")],
    );
    expect(sugestao?.candidatas).toEqual([]);
  });

  it("sentido oposto nao casa", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "entrada", "500,00")],
      [movimentacao("m1", "2026-09-10", "saida", "500,00")],
    );
    expect(sugestao?.candidatas).toEqual([]);
  });

  it("DUAS candidatas: mostra as duas e NAO escolhe", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "entrada", "500,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "500,00"), movimentacao("m2", "2026-09-11", "entrada", "500,00")],
    );

    expect(sugestao?.candidatas).toHaveLength(2);
    expect(sugestao?.confianca).toBe("revisao");
    expect(sugestao?.exata).toBe(false);
  });

  it("ordena as candidatas pela proximidade da data do banco", () => {
    const [sugestao] = sugerirConciliacoes(
      [item("i1", "2026-09-10", "entrada", "500,00")],
      [
        movimentacao("longe", "2026-09-13", "entrada", "500,00"),
        movimentacao("perto", "2026-09-11", "entrada", "500,00"),
      ],
    );
    expect(sugestao?.candidatas.map((c) => c.movimentacaoId)).toEqual(["perto", "longe"]);
  });

  it("duas mensalidades identicas no mesmo dia: NENHUMA das duas e exata", () => {
    // O caso que motivou a regra. Sem isso, aceitar em lote casaria as duas na
    // ordem da tela, e o erro so apareceria na cobranca do cliente errado.
    const sugestoes = sugerirConciliacoes(
      [item("i1", "2026-09-10", "entrada", "500,00"), item("i2", "2026-09-10", "entrada", "500,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "500,00"), movimentacao("m2", "2026-09-10", "entrada", "500,00")],
    );

    expect(sugestoes).toHaveLength(2);
    expect(sugestoes.every((s) => s.candidatas.length === 2)).toBe(true);
    expect(sugestoes.every((s) => s.exata === false)).toBe(true);
    expect(sugestoes.every((s) => s.confianca === "revisao")).toBe(true);
  });

  it("uma movimentacao disputada por dois itens nao vira sugestao exata de ninguem", () => {
    const sugestoes = sugerirConciliacoes(
      [item("i1", "2026-09-10", "entrada", "500,00"), item("i2", "2026-09-10", "entrada", "500,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "500,00")],
    );
    expect(sugestoes.every((s) => s.exata === false)).toBe(true);
  });

  it("item sem nenhuma candidata aparece mesmo assim, para a tela poder dizer isso", () => {
    const sugestoes = sugerirConciliacoes([item("i1", "2026-09-10", "saida", "77,00")], []);
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0]?.candidatas).toEqual([]);
  });

  it("varios itens independentes cada um com a sua exata", () => {
    const sugestoes = sugerirConciliacoes(
      [item("i1", "2026-09-10", "saida", "100,00"), item("i2", "2026-09-11", "entrada", "200,00")],
      [movimentacao("m1", "2026-09-10", "saida", "100,00"), movimentacao("m2", "2026-09-11", "entrada", "200,00")],
    );
    expect(sugestoes.map((s) => s.exata)).toEqual([true, true]);
    expect(sugestoes.map((s) => s.candidatas[0]?.movimentacaoId)).toEqual(["m1", "m2"]);
  });
});

describe("validacao da conciliacao 1:N", () => {
  it("aceita quando as somas batem exatamente", () => {
    const resultado = validarConciliacao(
      [item("i1", "2026-09-10", "entrada", "1.000,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "600,00"), movimentacao("m2", "2026-09-10", "entrada", "400,00")],
    );
    expect(resultado.sucesso).toBe(true);
  });

  it("recusa por um centavo de diferenca, dizendo os dois totais", () => {
    const resultado = validarConciliacao(
      [item("i1", "2026-09-10", "entrada", "1.000,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "599,99"), movimentacao("m2", "2026-09-10", "entrada", "400,00")],
    );
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.erro.message).toContain("R$ 1.000,00");
      expect(resultado.erro.message).toContain("R$ 999,99");
    }
  });

  it("recusa misturar entrada com saida", () => {
    const resultado = validarConciliacao(
      [item("i1", "2026-09-10", "entrada", "100,00")],
      [movimentacao("m1", "2026-09-10", "saida", "100,00")],
    );
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) expect(resultado.erro.message).toContain("mesmo sentido");
  });

  it("recusa selecao vazia de qualquer um dos lados", () => {
    expect(validarConciliacao([], [movimentacao("m1", "2026-09-10", "entrada", "1,00")]).sucesso).toBe(false);
    expect(validarConciliacao([item("i1", "2026-09-10", "entrada", "1,00")], []).sucesso).toBe(false);
  });

  it("aceita N:1 tambem (duas entradas parciais para um recebimento)", () => {
    const resultado = validarConciliacao(
      [item("i1", "2026-09-10", "entrada", "300,00"), item("i2", "2026-09-11", "entrada", "700,00")],
      [movimentacao("m1", "2026-09-10", "entrada", "1.000,00")],
    );
    expect(resultado.sucesso).toBe(true);
  });

  it("conciliacao com varios de um lado nasce como 'revisao'", () => {
    expect(confiancaDeConciliacaoManual(1, 1)).toBe("possivel");
    expect(confiancaDeConciliacaoManual(1, 2)).toBe("revisao");
    expect(confiancaDeConciliacaoManual(2, 1)).toBe("revisao");
  });
});
