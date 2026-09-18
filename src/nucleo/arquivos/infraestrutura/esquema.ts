import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaInstante, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Categoria: ANEXOS
 * Documentacao: docs/modelo-dados/anexos.md
 *
 * O banco guarda apenas METADADOS do arquivo. O conteudo fica no
 * armazenamento (disco local ou objetos compativel com S3), identificado por
 * `chave_armazenamento`. Os vinculos com titulos, pagamentos etc. ficam em
 * tabelas `anexos_<entidade>` com chave estrangeira real (sem coluna polimorfica).
 */
export const arquivos = pgTable(
  "arquivos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Chave opaca no armazenamento. Nunca e o nome original. */
    chaveArmazenamento: text("chave_armazenamento").notNull(),
    nomeOriginal: text("nome_original").notNull(),
    /** Tipo de conteudo verificado (ex.: application/pdf). */
    tipoConteudo: text("tipo_conteudo").notNull(),
    tamanhoBytes: bigint("tamanho_bytes", { mode: "number" }).notNull(),
    /** SHA-256 do conteudo, em hexadecimal. Integridade e deteccao de duplicidade. */
    impressaoDigital: text("impressao_digital").notNull(),
    enviadoPorUsuarioId: text("enviado_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    /** Preenchido quando o conteudo foi removido do armazenamento (retencao). Metadados permanecem. */
    removidoEm: colunaInstante("removido_em"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_arquivos_chave").on(tabela.chaveArmazenamento),
    index("arquivos_empresa_impressao_idx").on(tabela.empresaId, tabela.impressaoDigital),
    check("verifica_arquivos_tamanho", sql`tamanho_bytes > 0`),
    check("verifica_arquivos_impressao", sql`impressao_digital ~ '^[0-9a-f]{64}$'`),
  ],
);
