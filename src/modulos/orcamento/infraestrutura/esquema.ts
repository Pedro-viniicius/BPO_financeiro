import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaDinheiro, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";
import { centrosCusto } from "@/modulos/centros-custo/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";

/**
 * Categoria: ORCAMENTO
 * Documentacao: docs/modelo-dados/categorias/orcamento.md
 *
 * orcamento (ano, empresa) 1:N item (mes, categoria, centro de custo opcional, valor planejado).
 * O REALIZADO nao e armazenado aqui: "planejado x realizado" e uma consulta
 * que compara itens_orcamento com titulos/movimentacoes classificados.
 */
export const situacaoOrcamento = pgEnum("situacao_orcamento", ["rascunho", "ativo", "encerrado"]);

export const orcamentos = pgTable(
  "orcamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    ano: integer("ano").notNull(),
    situacao: situacaoOrcamento("situacao").notNull().default("rascunho"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_orcamentos_nome").on(tabela.empresaId, tabela.ano, tabela.nome),
    index("orcamentos_empresa_ano_idx").on(tabela.empresaId, tabela.ano),
    check("verifica_orcamentos_ano", sql`ano BETWEEN 2000 AND 2200`),
  ],
);

export const itensOrcamento = pgTable(
  "itens_orcamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** CASCADE de proposito: itens nao existem sem o orcamento; apagar um orcamento em rascunho leva os itens. */
    orcamentoId: uuid("orcamento_id")
      .notNull()
      .references(() => orcamentos.id, { onDelete: "cascade" }),
    /** Primeiro dia do mes de competencia (CHECK garante dia 1). */
    competencia: colunaDataCivil("competencia").notNull(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    valorPlanejado: colunaDinheiro("valor_planejado").notNull(),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    // Unicidade tratando centro de custo nulo como "sem centro" (COALESCE evita duplicatas com NULL).
    uniqueIndex("unico_itens_orcamento_dimensoes").on(
      tabela.orcamentoId,
      tabela.competencia,
      tabela.categoriaId,
      sql`coalesce(${tabela.centroCustoId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("itens_orcamento_categoria_competencia_idx").on(tabela.categoriaId, tabela.competencia),
    check("verifica_itens_orcamento_valor", sql`valor_planejado >= 0`),
    check("verifica_itens_orcamento_competencia", sql`extract(day from competencia) = 1`),
  ],
);

export const relacoesOrcamentos = relations(orcamentos, ({ many }) => ({
  itens: many(itensOrcamento),
}));

export const relacoesItensOrcamento = relations(itensOrcamento, ({ one }) => ({
  orcamento: one(orcamentos, { fields: [itensOrcamento.orcamentoId], references: [orcamentos.id] }),
}));
