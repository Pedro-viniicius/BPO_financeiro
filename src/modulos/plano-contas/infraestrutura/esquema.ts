import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Categoria: CLASSIFICACAO FINANCEIRA
 * Documentacao: docs/modelo-dados/categorias/classificacao-financeira.md
 *
 * Tres conceitos que NAO se confundem:
 * - conta bancaria (modulo bancos): ONDE o dinheiro esta ("BB conta corrente");
 * - categoria financeira (aqui): O QUE e o gasto/receita, na lingua do dono ("Energia eletrica");
 * - conta do plano (aqui): linha do plano gerencial que define a DRE ("3.2.01.004 Despesas com energia").
 * - centro de custo (modulo centros-custo): QUAL AREA gastou/gerou ("Loja Centro").
 */

/** Linha da DRE gerencial a que uma conta do plano pertence. Define onde o valor aparece no resultado. */
export const grupoDre = pgEnum("grupo_dre", [
  "receita_bruta",
  "deducao",
  "custo",
  "despesa_operacional",
  "resultado_financeiro",
  "nao_operacional",
  "transferencia", // nao entra na DRE (movimentacao entre contas)
]);

/** Comportamento do gasto em relacao ao volume. Usado por margem de contribuicao e ponto de equilibrio. */
export const naturezaCusto = pgEnum("natureza_custo", ["fixo", "variavel"]);

export const contasPlano = pgTable(
  "contas_plano",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Codigo hierarquico legivel: "3", "3.2", "3.2.01", "3.2.01.004". */
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    grupoDre: grupoDre("grupo_dre").notNull(),
    contaPaiId: uuid("conta_pai_id").references((): AnyPgColumn => contasPlano.id, { onDelete: "restrict" }),
    /** Contas sinteticas (agrupadoras) nao recebem categorias; apenas as analiticas. */
    aceitaClassificacao: boolean("aceita_classificacao").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_contas_plano_codigo").on(tabela.empresaId, tabela.codigo),
    index("contas_plano_empresa_grupo_idx").on(tabela.empresaId, tabela.grupoDre),
    check("verifica_contas_plano_codigo", sql`codigo ~ '^[0-9]+(\\.[0-9]+)*$'`),
    check("verifica_contas_plano_sem_autorreferencia", sql`conta_pai_id IS NULL OR conta_pai_id <> id`),
  ],
);

export const categoriasFinanceiras = pgTable(
  "categorias_financeiras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    /** Toda categoria aponta para uma conta analitica do plano: e assim que o lancamento chega a DRE. */
    contaPlanoId: uuid("conta_plano_id")
      .notNull()
      .references(() => contasPlano.id, { onDelete: "restrict" }),
    categoriaPaiId: uuid("categoria_pai_id").references((): AnyPgColumn => categoriasFinanceiras.id, { onDelete: "restrict" }),
    /** Opcional. Necessario para margem de contribuicao e ponto de equilibrio. */
    naturezaCusto: naturezaCusto("natureza_custo"),
    ordem: integer("ordem").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_categorias_nome").on(tabela.empresaId, tabela.nome),
    index("categorias_empresa_conta_plano_idx").on(tabela.empresaId, tabela.contaPlanoId),
    check("verifica_categorias_nome", sql`length(trim(nome)) > 0`),
    check("verifica_categorias_sem_autorreferencia", sql`categoria_pai_id IS NULL OR categoria_pai_id <> id`),
  ],
);
