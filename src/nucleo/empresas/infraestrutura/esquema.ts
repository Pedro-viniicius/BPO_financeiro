import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";

/**
 * Estrutura empresarial de uma instalacao (ver ADR-005):
 *
 *   organizacao (grupo economico ou cliente do BPO)
 *     └── empresa (CNPJ; dona dos dados financeiros)
 *           └── filial (unidade; opcional)
 *
 * Todo registro financeiro tem `empresa_id`. `filial_id` so aparece onde faz
 * sentido operacional. `organizacao_id` e usado para consolidacao futura e
 * para vinculos de usuario "em todas as empresas do grupo".
 */
export const organizacoes = pgTable("organizacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const empresas = pgTable(
  "empresas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id),
    nome: text("nome").notNull(),
    nomeFantasia: text("nome_fantasia"),
    /** Somente digitos. Opcional no cadastro, mas unico quando informado. */
    cnpj: text("cnpj"),
    /** Fuso horario usado para calcular "hoje" desta empresa. */
    fusoHorario: text("fuso_horario").notNull().default("America/Sao_Paulo"),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    excluidoEm: timestamp("excluido_em", { withTimezone: true }),
  },
  (tabela) => [
    index("empresas_organizacao_idx").on(tabela.organizacaoId),
    uniqueIndex("empresas_cnpj_unico_idx").on(tabela.cnpj),
    check("verifica_empresas_cnpj", sql`cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'`),
    check("verifica_empresas_nome", sql`length(trim(nome)) > 0`),
  ],
);

export const filiais = pgTable(
  "filiais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id),
    nome: text("nome").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("filiais_empresa_idx").on(tabela.empresaId)],
);

/**
 * Papeis aceitos em um vinculo. A lista e a mesma de
 * `nucleo/autorizacao/papeis.ts` (PAPEIS); um teste garante que as duas nao
 * divergem. O banco recusa qualquer outro valor.
 */
export const papelVinculo = pgEnum("papel_vinculo", [
  "administrador",
  "financeiro",
  "tesouraria",
  "controladoria",
  "auditor",
  "somente_leitura",
]);

/**
 * Vinculo de um usuario com a estrutura empresarial.
 *
 * - `empresa_id` preenchido: acesso a essa empresa com o papel informado.
 * - `empresa_id` nulo: acesso a TODAS as empresas da organizacao (util para
 *   o operador de BPO e para o administrador do grupo).
 * - `papel`: nome de um papel definido em `nucleo/autorizacao/papeis.ts`.
 * - `permissoes_extras`: permissoes concedidas alem do papel (lista de textos).
 * - `permissoes_removidas`: permissoes retiradas do papel para este vinculo.
 * - `ativo = false`: vinculo revogado. O acesso termina na proxima requisicao;
 *   a linha permanece para a auditoria fazer sentido.
 *
 * Unicidade `unico_vinculos_usuario_escopo` com NULLS NOT DISTINCT: um usuario
 * tem no maximo um vinculo por empresa e no maximo um vinculo "toda a
 * organizacao" por organizacao (sem isso, dois vinculos com `empresa_id` nulo
 * seriam aceitos, porque o PostgreSQL trata NULLs como distintos).
 *
 * A politica de autorizacao (deny por padrao) esta em `nucleo/autorizacao`.
 */
export const vinculosUsuario = pgTable(
  "vinculos_usuario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id),
    empresaId: uuid("empresa_id").references(() => empresas.id),
    papel: papelVinculo("papel").notNull(),
    permissoesExtras: jsonb("permissoes_extras").$type<string[]>().notNull().default([]),
    permissoesRemovidas: jsonb("permissoes_removidas").$type<string[]>().notNull().default([]),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index("vinculos_usuario_usuario_idx").on(tabela.usuarioId),
    index("vinculos_usuario_empresa_idx").on(tabela.empresaId),
    unique("unico_vinculos_usuario_escopo").on(tabela.usuarioId, tabela.organizacaoId, tabela.empresaId).nullsNotDistinct(),
  ],
);
