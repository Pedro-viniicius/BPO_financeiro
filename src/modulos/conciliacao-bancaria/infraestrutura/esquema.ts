import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaInstante } from "@/banco-dados/esquemas/colunas-comuns";
import { confiancaConciliacao } from "@/banco-dados/esquemas/enumeracoes";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";
import { contasBancarias, itensExtratoBancario, movimentacoesBancarias } from "@/modulos/bancos/infraestrutura/esquema";

/**
 * Categoria: CONCILIACAO BANCARIA
 * Documentacao: docs/modelo-dados/categorias/conciliacao.md
 *
 * Uma conciliacao liga N itens de extrato a N movimentacoes internas
 * (normalmente 1:1; um debito unico pagando tres boletos e 1:3; duas
 * entradas parciais para um recebimento e 2:1).
 *
 * Invariantes:
 * - um item ou uma movimentacao participa de NO MAXIMO UMA conciliacao ativa
 *   (indice unico parcial nos vinculos, onde ativo = true);
 * - desfazer nao apaga: marca `desfeita_em` e desativa os vinculos, preservando a decisao;
 * - Σ valores dos itens = Σ valores das movimentacoes (garantido pela aplicacao na transacao).
 */
export const origemDecisaoConciliacao = pgEnum("origem_decisao_conciliacao", ["manual", "sugestao_aceita", "lote"]);

export const conciliacoesBancarias = pgTable(
  "conciliacoes_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    dataConciliacao: colunaDataCivil("data_conciliacao").notNull(),
    /** Nivel de confianca da sugestao que originou a conciliacao. */
    confianca: confiancaConciliacao("confianca").notNull(),
    origemDecisao: origemDecisaoConciliacao("origem_decisao").notNull(),
    decididaPorUsuarioId: text("decidida_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    observacoes: text("observacoes"),
    desfeitaEm: colunaInstante("desfeita_em"),
    motivoDesfazer: text("motivo_desfazer"),
    desfeitaPorUsuarioId: text("desfeita_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    index("conciliacoes_conta_data_idx").on(tabela.contaBancariaId, tabela.dataConciliacao),
    index("conciliacoes_empresa_idx").on(tabela.empresaId),
    check("verifica_conciliacoes_desfazer", sql`(desfeita_em IS NULL) = (motivo_desfazer IS NULL)`),
  ],
);

export const conciliacoesItensExtrato = pgTable(
  "conciliacoes_itens_extrato",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conciliacaoId: uuid("conciliacao_id")
      .notNull()
      .references(() => conciliacoesBancarias.id, { onDelete: "restrict" }),
    itemExtratoId: uuid("item_extrato_id")
      .notNull()
      .references(() => itensExtratoBancario.id, { onDelete: "restrict" }),
    /** Espelha o estado da conciliacao (ativa = nao desfeita). Permite o indice unico parcial abaixo. */
    ativo: boolean("ativo").notNull().default(true),
  },
  (tabela) => [
    uniqueIndex("unico_conciliacao_item_ativo").on(tabela.itemExtratoId).where(sql`ativo = true`),
    uniqueIndex("unico_conciliacao_item_vinculo").on(tabela.conciliacaoId, tabela.itemExtratoId),
  ],
);

export const conciliacoesMovimentacoes = pgTable(
  "conciliacoes_movimentacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conciliacaoId: uuid("conciliacao_id")
      .notNull()
      .references(() => conciliacoesBancarias.id, { onDelete: "restrict" }),
    movimentacaoId: uuid("movimentacao_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    ativo: boolean("ativo").notNull().default(true),
  },
  (tabela) => [
    uniqueIndex("unico_conciliacao_movimentacao_ativa").on(tabela.movimentacaoId).where(sql`ativo = true`),
    uniqueIndex("unico_conciliacao_movimentacao_vinculo").on(tabela.conciliacaoId, tabela.movimentacaoId),
  ],
);

export const relacoesConciliacoes = relations(conciliacoesBancarias, ({ many }) => ({
  itensExtrato: many(conciliacoesItensExtrato),
  movimentacoes: many(conciliacoesMovimentacoes),
}));

export const relacoesConciliacoesItens = relations(conciliacoesItensExtrato, ({ one }) => ({
  conciliacao: one(conciliacoesBancarias, { fields: [conciliacoesItensExtrato.conciliacaoId], references: [conciliacoesBancarias.id] }),
  item: one(itensExtratoBancario, { fields: [conciliacoesItensExtrato.itemExtratoId], references: [itensExtratoBancario.id] }),
}));

export const relacoesConciliacoesMovimentacoes = relations(conciliacoesMovimentacoes, ({ one }) => ({
  conciliacao: one(conciliacoesBancarias, { fields: [conciliacoesMovimentacoes.conciliacaoId], references: [conciliacoesBancarias.id] }),
  movimentacao: one(movimentacoesBancarias, { fields: [conciliacoesMovimentacoes.movimentacaoId], references: [movimentacoesBancarias.id] }),
}));
