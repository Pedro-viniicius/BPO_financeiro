import { describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "./apresentacao";

describe("apresentacao financeira", () => {
  it("mostra a data no formato brasileiro sem mudar o dominio", () => {
    const original = dataCivilDeTexto("2026-10-05");
    expect(formatarDataBrasileira(original)).toBe("05/10/2026");
    // O valor do dominio continua ISO: apresentacao nao altera armazenamento.
    expect(original).toBe("2026-10-05");
  });

  it("mostra dinheiro em BRL", () => {
    expect(formatarDinheiro(Dinheiro.deTexto("1250.00"))).toContain("1.250,00");
    expect(formatarDinheiro(Dinheiro.deTexto("0.00"))).toContain("0,00");
  });

  it("cor semantica segue o significado, nunca a marca", () => {
    expect(tomDaSituacao("liquidada")).toBe("sucesso");
    expect(tomDaSituacao("vencida")).toBe("perigo");
    expect(tomDaSituacao("parcial")).toBe("atencao");
    expect(tomDaSituacao("aberta")).toBe("neutro");
  });
});
