import { describe, expect, it } from "vitest";

import type { ContextoFinanceiro } from "./contratos/contexto-financeiro";
import { aplicarPoliticaDados } from "./politica-dados";

const base: ContextoFinanceiro = {
  empresa: { nomeFantasia: "Padaria Exemplo" },
  periodo: { inicio: "2026-08-01", fim: "2026-08-31" },
  moeda: "BRL",
  caixa: {
    saldoDisponivel: "12000.00",
    entradasPrevistas30Dias: "30000.00",
    saidasPrevistas30Dias: "35000.00",
    saldoProjetado30Dias: "7000.00",
  },
};

describe("politica de dados da IA", () => {
  it("deixa passar um contexto limpo sem alteracoes", () => {
    const resultado = aplicarPoliticaDados(base);
    expect(resultado.permitido).toBe(true);
    expect(resultado.motivos).toEqual([]);
    expect(resultado.contextoFiltrado).toEqual(base);
  });

  it("remove campos que nao fazem parte do contrato", () => {
    const contaminado = { ...base, lancamentos: [{ descricao: "pagamento fulano" }] } as unknown as ContextoFinanceiro;
    const resultado = aplicarPoliticaDados(contaminado);
    expect(resultado.permitido).toBe(true);
    expect(resultado.motivos[0]).toMatch(/lancamentos/);
    expect("lancamentos" in resultado.contextoFiltrado).toBe(false);
  });

  it("bloqueia quando detecta CPF ou e-mail em qualquer texto", () => {
    const comCpf = { ...base, pontosAtencao: ["Cliente 529.982.247-25 atrasado"] };
    expect(aplicarPoliticaDados(comCpf).permitido).toBe(false);
    const comEmail = { ...base, pontosAtencao: ["Contato: joao@exemplo.com"] };
    expect(aplicarPoliticaDados(comEmail).permitido).toBe(false);
  });
});
