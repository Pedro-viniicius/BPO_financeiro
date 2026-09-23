import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { colunaInstante } from "@/banco-dados/esquemas/colunas-comuns";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Categoria: IMPLANTACAO
 *
 * Toda importacao de planilha vira um LOTE. O lote existe por uma razao
 * pratica: importacao de carga inicial erra. A planilha vem com a coluna
 * trocada, com o valor em outro formato, com o cliente escrito de dois jeitos.
 * Sem lote, desfazer significa procurar a mao o que entrou — e o que entrou se
 * mistura, em minutos, com o que foi lancado de verdade.
 *
 * Os itens ficam numa tabela GENERICA em vez de uma coluna em cada tabela
 * financeira. Assim a importacao nao acrescenta coluna a `titulos_pagar`,
 * `pessoas` e `clientes`, e o desfazer e uma varredura de uma lista.
 */
export const tipoLoteImportacao = pgEnum("tipo_lote_importacao", ["pessoas", "contas"]);

export const lotesImportacao = pgTable(
  "lotes_importacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    tipo: tipoLoteImportacao("tipo").notNull(),
    /** Nome do arquivo enviado. E como a pessoa reconhece o lote depois. */
    arquivoNome: text("arquivo_nome").notNull(),
    quantidade: integer("quantidade").notNull(),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
    /** Preenchidos quando o lote e desfeito. O lote NAO e apagado: fica o registro. */
    desfeitoEm: colunaInstante("desfeito_em"),
    desfeitoPor: text("desfeito_por").references(() => user.id, { onDelete: "restrict" }),
    motivoDesfazer: text("motivo_desfazer"),
  },
  (tabela) => [
    index("lotes_importacao_empresa_idx").on(tabela.empresaId, tabela.criadoEm),
    check("verifica_lotes_quantidade", sql`quantidade >= 0`),
    check(
      "verifica_lotes_desfazer",
      sql`(desfeito_em IS NULL) = (desfeito_por IS NULL) AND (desfeito_em IS NOT NULL OR motivo_desfazer IS NULL)`,
    ),
  ],
);

export const itensLoteImportacao = pgTable(
  "itens_lote_importacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loteId: uuid("lote_id")
      .notNull()
      .references(() => lotesImportacao.id, { onDelete: "cascade" }),
    /** Nome da tabela: "pessoas", "clientes", "fornecedores", "titulos_pagar"... */
    entidade: text("entidade").notNull(),
    entidadeId: uuid("entidade_id").notNull(),
    /** Ordem de criacao. Desfazer percorre ao CONTRARIO, por causa das chaves. */
    ordem: integer("ordem").notNull(),
  },
  (tabela) => [index("itens_lote_importacao_lote_idx").on(tabela.loteId, tabela.ordem)],
);
