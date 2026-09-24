import { describe, expect, it } from "vitest";

import { Dinheiro } from "../dinheiro/indice";
import {
  camposEditaveis,
  MOTIVO_BAIXA_PARCELA,
  MOTIVO_BAIXA_TITULO,
  MOTIVO_CANCELADA,
  motivoDoBloqueio,
  podeEditarAlgo,
} from "./regras-edicao";
import { abatimentoDaBaixa, validarValorDaBaixa, valorQueMovimentaOBanco } from "./validacao-de-baixa";

const reais = (texto: string) => Dinheiro.deTextoBrasileiro(texto);

describe("desconto na quitacao", () => {
  it("o exemplo do enunciado: R$ 1.000 quitada com R$ 950 e R$ 50 de desconto", () => {
    const principal = reais("950,00");
    const desconto = reais("50,00");

    // Sai do banco apenas o dinheiro.
    expect(valorQueMovimentaOBanco(principal).formatarBrasileiro()).toBe("R$\u00a0950,00");
    // O saldo cai o valor cheio: o desconto abate sem dinheiro andar.
    expect(abatimentoDaBaixa(principal, desconto).formatarBrasileiro()).toBe("R$\u00a01.000,00");

    expect(validarValorDaBaixa({ valorPrincipal: principal, valorDesconto: desconto, saldoRestante: reais("1.000,00") }).sucesso).toBe(
      true,
    );
  });

  it("o que abate o saldo e DIFERENTE do que sai do banco", () => {
    const principal = reais("950,00");
    const desconto = reais("50,00");
    expect(valorQueMovimentaOBanco(principal).igual(abatimentoDaBaixa(principal, desconto))).toBe(false);
  });

  it("juros e multa saem do banco mas nao abatem o saldo", () => {
    const principal = reais("1.000,00");
    const juros = reais("30,00");
    const multa = reais("20,00");

    expect(valorQueMovimentaOBanco(principal, juros, multa).formatarBrasileiro()).toBe("R$\u00a01.050,00");
    expect(abatimentoDaBaixa(principal).formatarBrasileiro()).toBe("R$\u00a01.000,00");
    // Continua valido mesmo saindo mais dinheiro do que o saldo da parcela.
    expect(validarValorDaBaixa({ valorPrincipal: principal, saldoRestante: reais("1.000,00") }).sucesso).toBe(true);
  });

  it("juros, multa e desconto convivem na mesma baixa", () => {
    const noBanco = valorQueMovimentaOBanco(reais("900,00"), reais("30,00"), reais("20,00"));
    expect(noBanco.formatarBrasileiro()).toBe("R$\u00a0950,00");
    expect(abatimentoDaBaixa(reais("900,00"), reais("100,00")).formatarBrasileiro()).toBe("R$\u00a01.000,00");
  });

  it("recusa quando principal mais desconto passam do saldo", () => {
    const r = validarValorDaBaixa({
      valorPrincipal: reais("950,00"),
      valorDesconto: reais("100,00"),
      saldoRestante: reais("1.000,00"),
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro.message).toContain("valor mais desconto");
      expect(r.erro.message).toContain("R$\u00a01.000,00");
    }
  });

  it("recusa desconto negativo", () => {
    const r = validarValorDaBaixa({
      valorPrincipal: reais("100,00"),
      valorDesconto: reais("-10,00"),
      saldoRestante: reais("1.000,00"),
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro.message).toContain("desconto");
  });

  it("recusa perdao total: sem dinheiro nenhum, isso e cancelamento, nao baixa", () => {
    const r = validarValorDaBaixa({
      valorPrincipal: Dinheiro.zero(),
      valorDesconto: reais("1.000,00"),
      saldoRestante: reais("1.000,00"),
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro.message).toContain("maior que zero");
  });

  it("desconto ausente equivale a desconto zero (comportamento anterior preservado)", () => {
    const saldo = reais("600,00");
    expect(validarValorDaBaixa({ valorPrincipal: reais("600,00"), saldoRestante: saldo }).sucesso).toBe(true);
    expect(validarValorDaBaixa({ valorPrincipal: reais("600,01"), saldoRestante: saldo }).sucesso).toBe(false);
    expect(abatimentoDaBaixa(reais("600,00")).igual(reais("600,00"))).toBe(true);
  });
});

describe("regras de edicao", () => {
  const semBaixa = { cancelado: false, temBaixaAtiva: false };
  const comBaixa = { cancelado: false, temBaixaAtiva: true };
  const cancelado = { cancelado: true, temBaixaAtiva: false };
  const parcelaLimpa = { cancelada: false, temBaixaAtiva: false };
  const parcelaBaixada = { cancelada: false, temBaixaAtiva: true };

  it("sem baixa: tudo editavel", () => {
    expect(camposEditaveis(semBaixa, parcelaLimpa)).toEqual({
      descricao: true,
      pessoa: true,
      vencimento: true,
      valor: true,
    });
  });

  it("com baixa ativa: descricao e vencimento sim; pessoa e valor nao", () => {
    expect(camposEditaveis(comBaixa, parcelaBaixada)).toEqual({
      descricao: true,
      pessoa: false,
      vencimento: false,
      valor: false,
    });
  });

  it("parcela AINDA EM ABERTO de titulo com baixa: vencimento e valor continuam editaveis", () => {
    // Conta parcelada com a 1a paga: a 5a ainda pode ser renegociada.
    expect(camposEditaveis(comBaixa, parcelaLimpa)).toEqual({
      descricao: true,
      pessoa: false,
      vencimento: true,
      valor: true,
    });
  });

  it("cancelada: nada editavel", () => {
    expect(camposEditaveis(cancelado, parcelaLimpa)).toEqual({
      descricao: false,
      pessoa: false,
      vencimento: false,
      valor: false,
    });
    expect(camposEditaveis(semBaixa, { cancelada: true, temBaixaAtiva: false }).descricao).toBe(false);
    expect(podeEditarAlgo(cancelado, parcelaLimpa)).toBe(false);
  });

  it("cada bloqueio explica o motivo em texto, e campo livre nao tem motivo", () => {
    expect(motivoDoBloqueio("descricao", semBaixa, parcelaLimpa)).toBeNull();
    expect(motivoDoBloqueio("pessoa", comBaixa, parcelaLimpa)).toBe(MOTIVO_BAIXA_TITULO);
    expect(motivoDoBloqueio("valor", comBaixa, parcelaBaixada)).toBe(MOTIVO_BAIXA_PARCELA);
    expect(motivoDoBloqueio("vencimento", comBaixa, parcelaBaixada)).toBe(MOTIVO_BAIXA_PARCELA);
    expect(motivoDoBloqueio("descricao", cancelado, parcelaLimpa)).toBe(MOTIVO_CANCELADA);
  });

  it("o cancelamento vence a baixa: cancelada explica cancelamento, nao baixa", () => {
    expect(motivoDoBloqueio("valor", { cancelado: true, temBaixaAtiva: true }, parcelaBaixada)).toBe(MOTIVO_CANCELADA);
  });

  it("ha o que editar enquanto a conta nao for cancelada", () => {
    expect(podeEditarAlgo(semBaixa, parcelaLimpa)).toBe(true);
    expect(podeEditarAlgo(comBaixa, parcelaBaixada)).toBe(true);
  });
});
