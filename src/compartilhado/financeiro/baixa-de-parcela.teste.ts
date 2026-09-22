import { describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";
import { saldoRestante, situacaoDerivada, estaEmAberto, type ParcelaParaCalculo } from "./baixa-de-parcela";
import { validarValorDaBaixa } from "./validacao-de-baixa";

const HOJE = dataCivilDeTexto("2026-09-22");
const ONTEM = dataCivilDeTexto("2026-09-21");
const AMANHA = dataCivilDeTexto("2026-09-23");

function parcela(original: string, baixado: string, vencimento = AMANHA, gravada: ParcelaParaCalculo["situacaoGravada"] = "aberta"): ParcelaParaCalculo {
  return {
    valorOriginal: Dinheiro.deTexto(original),
    valorBaixado: Dinheiro.deTexto(baixado),
    dataVencimento: vencimento,
    situacaoGravada: gravada,
  };
}

describe("saldo restante", () => {
  it("R$ 1.000,00 com pagamento de R$ 1.000,00 deixa saldo zero", () => {
    expect(saldoRestante(parcela("1000.00", "1000.00")).paraTexto()).toBe("0.00");
  });

  it("R$ 1.000,00 com pagamento de R$ 400,00 deixa saldo de R$ 600,00", () => {
    expect(saldoRestante(parcela("1000.00", "400.00")).paraTexto()).toBe("600.00");
  });

  it("nunca devolve saldo negativo, mesmo com dado inconsistente no banco", () => {
    expect(saldoRestante(parcela("1000.00", "1200.00")).paraTexto()).toBe("0.00");
  });

  it("centavos nao se perdem no caminho", () => {
    expect(saldoRestante(parcela("1000.00", "333.33")).paraTexto()).toBe("666.67");
  });
});

describe("situacao derivada", () => {
  it("sem nenhuma baixa e com vencimento futuro: em aberto", () => {
    expect(situacaoDerivada(parcela("1000.00", "0.00", AMANHA), HOJE)).toBe("aberta");
  });

  it("vencimento no passado e saldo em aberto: vencida", () => {
    expect(situacaoDerivada(parcela("1000.00", "0.00", ONTEM), HOJE)).toBe("vencida");
  });

  it("vencendo HOJE ainda nao e vencida", () => {
    expect(situacaoDerivada(parcela("1000.00", "0.00", HOJE), HOJE)).toBe("aberta");
  });

  it("baixa parcial com vencimento futuro: parcial", () => {
    expect(situacaoDerivada(parcela("1000.00", "400.00", AMANHA), HOJE)).toBe("parcial");
  });

  it("baixa parcial com vencimento passado: vencida vence 'parcial' (o que importa e a cobranca)", () => {
    expect(situacaoDerivada(parcela("1000.00", "400.00", ONTEM), HOJE)).toBe("vencida");
  });

  it("quitada ontem nao aparece como vencida", () => {
    expect(situacaoDerivada(parcela("1000.00", "1000.00", ONTEM, "liquidada"), HOJE)).toBe("liquidada");
  });

  it("saldo zerado ja conta como liquidada mesmo se o banco ainda disser 'aberta'", () => {
    // Divergencia possivel se alguem mexer no banco por fora: o dinheiro manda.
    expect(situacaoDerivada(parcela("1000.00", "1000.00", ONTEM, "aberta"), HOJE)).toBe("liquidada");
  });

  it("cancelada vence qualquer calculo, inclusive vencimento passado", () => {
    expect(situacaoDerivada(parcela("1000.00", "0.00", ONTEM, "cancelada"), HOJE)).toBe("cancelada");
  });

  it("estaEmAberto separa o que ainda movimenta dinheiro", () => {
    expect(estaEmAberto(parcela("1000.00", "0.00", AMANHA), HOJE)).toBe(true);
    expect(estaEmAberto(parcela("1000.00", "400.00", ONTEM), HOJE)).toBe(true);
    expect(estaEmAberto(parcela("1000.00", "1000.00", ONTEM, "liquidada"), HOJE)).toBe(false);
    expect(estaEmAberto(parcela("1000.00", "0.00", ONTEM, "cancelada"), HOJE)).toBe(false);
  });
});

describe("validacao do valor da baixa", () => {
  const saldo = Dinheiro.deTexto("600.00");

  it("aceita pagamento igual ao saldo", () => {
    expect(validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("600.00"), saldoRestante: saldo }).sucesso).toBe(true);
  });

  it("aceita pagamento parcial", () => {
    expect(validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("100.00"), saldoRestante: saldo }).sucesso).toBe(true);
  });

  it("recusa pagamento acima do saldo", () => {
    const r = validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("600.01"), saldoRestante: saldo });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro.message).toContain("saldo restante");
  });

  it("recusa valor zero", () => {
    expect(validarValorDaBaixa({ valorPrincipal: Dinheiro.zero(), saldoRestante: saldo }).sucesso).toBe(false);
  });

  it("recusa valor negativo", () => {
    expect(validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("-10.00"), saldoRestante: saldo }).sucesso).toBe(false);
  });

  it("recusa qualquer pagamento em parcela ja quitada (protege contra baixa duplicada)", () => {
    const r = validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("100.00"), saldoRestante: Dinheiro.zero() });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro.message).toContain("já foi quitada");
  });

  it("conta de R$ 1.000 quitada: nova tentativa de R$ 100 e rejeitada", () => {
    const p = parcela("1000.00", "1000.00", AMANHA, "liquidada");
    const r = validarValorDaBaixa({ valorPrincipal: Dinheiro.deTexto("100.00"), saldoRestante: saldoRestante(p) });
    expect(r.sucesso).toBe(false);
  });
});
