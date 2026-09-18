import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import * as esquema from "@/banco-dados/esquemas/indice";
import { GeradorCodigoPostgres } from "@/nucleo/codigos/publico";
import type { IdEmpresa } from "@/compartilhado/tipos/identificadores";

import { apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste } from "./apoio-testes-banco";

/**
 * Transacoes: ou tudo e gravado, ou nada. Ver docs/modelo-dados/transacoes.md.
 */
describe.skipIf(!urlBancoTeste)("transacoes (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  afterAll(async () => cliente.end());

  it("uma falha no meio desfaz tudo o que a transacao gravou", async () => {
    const cenario = await criarCenarioBase(banco);
    try {
      const nomePessoa = `Pessoa transacional ${crypto.randomUUID()}`;
      await expect(
        banco.transaction(async (tx) => {
          await tx.insert(esquema.pessoas).values({ organizacaoId: cenario.organizacaoId, tipo: "fisica", nome: nomePessoa });
          // Segunda gravacao viola CHECK (valor zero) -> a transacao inteira falha.
          await tx.insert(esquema.contasBancarias).values({
            empresaId: cenario.empresaId,
            tipo: "caixa",
            nome: "Caixa invalido",
            dataSaldoInicial: "2026-01-01",
            saldoInicial: "abc" as unknown as string,
          });
        }),
      ).rejects.toThrow();

      const pessoas = await banco.select().from(esquema.pessoas).where(eq(esquema.pessoas.nome, nomePessoa));
      expect(pessoas).toHaveLength(0);
    } finally {
      await apagarCenarioBase(banco, cenario);
    }
  });

  it("codigo gerado em transacao desfeita nao e consumido; em transacao confirmada, sim", async () => {
    const cenario = await criarCenarioBase(banco);
    const empresaId = cenario.empresaId as IdEmpresa;
    try {
      await expect(
        banco.transaction(async (tx) => {
          const codigo = await new GeradorCodigoPostgres(tx).gerarProximo(empresaId, "CP", 2026);
          expect(codigo).toBe("CP-2026-000001");
          throw new Error("desfazer");
        }),
      ).rejects.toThrow("desfazer");

      const confirmado = await banco.transaction((tx) => new GeradorCodigoPostgres(tx).gerarProximo(empresaId, "CP", 2026));
      expect(confirmado).toBe("CP-2026-000001");
      const seguinte = await banco.transaction((tx) => new GeradorCodigoPostgres(tx).gerarProximo(empresaId, "CP", 2026));
      expect(seguinte).toBe("CP-2026-000002");
      const outroAno = await banco.transaction((tx) => new GeradorCodigoPostgres(tx).gerarProximo(empresaId, "CP", 2027));
      expect(outroAno).toBe("CP-2027-000001");
    } finally {
      await apagarCenarioBase(banco, cenario);
    }
  });
});
