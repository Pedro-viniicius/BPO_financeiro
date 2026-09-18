import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaInstante } from "@/banco-dados/esquemas/colunas-comuns";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Contadores para codigos legiveis por humanos (ex.: CP-2026-000123).
 *
 * Um registro por (empresa, prefixo, ano). A geracao faz um unico
 * `INSERT ... ON CONFLICT DO UPDATE SET ultimo_numero = ultimo_numero + 1 RETURNING`,
 * que trava a linha: duas requisicoes simultaneas nunca recebem o mesmo numero.
 * Ver docs/modelo-dados/concorrencia.md.
 */
export const sequenciasCodigo = pgTable(
  "sequencias_codigo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Ex.: "CP" (contas a pagar), "CR" (contas a receber), "DV" (dividas). */
    prefixo: text("prefixo").notNull(),
    ano: integer("ano").notNull(),
    /** Ultimo numero entregue. O proximo codigo usa ultimo_numero + 1. */
    ultimoNumero: integer("ultimo_numero").notNull().default(0),
    atualizadoEm: colunaInstante("atualizado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_sequencias_codigo").on(tabela.empresaId, tabela.prefixo, tabela.ano),
    check("verifica_sequencias_numero", sql`ultimo_numero >= 0`),
    check("verifica_sequencias_ano", sql`ano BETWEEN 2000 AND 2200`),
  ],
);
