import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { empresas, filiais } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Categoria: CLASSIFICACAO FINANCEIRA (centros de custo)
 * Documentacao: docs/modelo-dados/categorias/classificacao-financeira.md
 *
 * Centro de custo = area, projeto ou unidade que gasta ou gera ("Producao",
 * "Loja Centro", "Projeto X"). Responde "QUEM gastou", enquanto a categoria
 * responde "O QUE foi gasto".
 */
export const centrosCusto = pgTable(
  "centros_custo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Quando o centro de custo corresponde a uma filial especifica. */
    filialId: uuid("filial_id").references(() => filiais.id, { onDelete: "restrict" }),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    centroPaiId: uuid("centro_pai_id").references((): AnyPgColumn => centrosCusto.id, { onDelete: "restrict" }),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_centros_custo_codigo").on(tabela.empresaId, tabela.codigo),
    index("centros_custo_empresa_idx").on(tabela.empresaId),
    check("verifica_centros_custo_sem_autorreferencia", sql`centro_pai_id IS NULL OR centro_pai_id <> id`),
  ],
);
