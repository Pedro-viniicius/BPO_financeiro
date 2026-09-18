import { afterAll, describe, expect, it } from "vitest";

import { GeradorCodigoPostgres } from "@/nucleo/codigos/publico";
import type { IdEmpresa } from "@/compartilhado/tipos/identificadores";

import { apagarCenarioBase, codigoErroPostgres, criarBancoTeste, criarCenarioBase, criarExtratoComItem, ERRO_POSTGRES, urlBancoTeste } from "./apoio-testes-banco";

/**
 * Concorrencia: varias requisicoes ao mesmo tempo nao podem furar a
 * unicidade. Usamos um pool com varias conexoes para que as operacoes
 * realmente corram em paralelo. Ver docs/modelo-dados/concorrencia.md.
 */
describe.skipIf(!urlBancoTeste)("concorrencia e idempotencia (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste(10);
  afterAll(async () => cliente.end());

  it("20 geracoes simultaneas de codigo produzem 20 codigos distintos e sequenciais", async () => {
    const cenario = await criarCenarioBase(banco);
    try {
      const empresaId = cenario.empresaId as IdEmpresa;
      const codigos = await Promise.all(
        Array.from({ length: 20 }, () => banco.transaction((tx) => new GeradorCodigoPostgres(tx).gerarProximo(empresaId, "CR", 2026))),
      );
      expect(new Set(codigos).size).toBe(20);
      expect(codigos.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `CR-2026-${String(i + 1).padStart(6, "0")}`));
    } finally {
      await apagarCenarioBase(banco, cenario);
    }
  });

  it("importacoes simultaneas do mesmo arquivo: exatamente uma vence", async () => {
    const cenario = await criarCenarioBase(banco);
    try {
      const resultados = await Promise.allSettled(
        Array.from({ length: 5 }, () => banco.transaction((tx) => criarExtratoComItem(tx, cenario, { impressaoArquivo: "mesmo-arquivo" }))),
      );
      const sucessos = resultados.filter((r) => r.status === "fulfilled");
      const falhas = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(sucessos).toHaveLength(1);
      expect(falhas).toHaveLength(4);
      for (const falha of falhas) {
        expect(codigoErroPostgres(falha.reason)).toBe(ERRO_POSTGRES.violacaoUnicidade);
      }
    } finally {
      await apagarCenarioBase(banco, cenario);
    }
  });

  it("o mesmo lancamento do banco (FITID) enviado duas vezes ao mesmo tempo gera um unico item", async () => {
    const cenario = await criarCenarioBase(banco);
    try {
      const resultados = await Promise.allSettled([
        banco.transaction((tx) => criarExtratoComItem(tx, cenario, { identificadorExterno: "FIT-CONCORRENTE" })),
        banco.transaction((tx) => criarExtratoComItem(tx, cenario, { identificadorExterno: "FIT-CONCORRENTE" })),
      ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    } finally {
      await apagarCenarioBase(banco, cenario);
    }
  });
});
