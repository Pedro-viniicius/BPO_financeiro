import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Trilha de auditoria financeira. SOMENTE INSERCAO.
 *
 * A protecao contra alteracao e feita em duas camadas:
 * 1. O usuario de banco da aplicacao nao recebe UPDATE nem DELETE nesta tabela
 *    (ver docs/arquitetura/banco-dados.md, secao "usuarios do banco").
 * 2. Uma migracao personalizada cria um gatilho (trigger) que rejeita
 *    UPDATE/DELETE mesmo para usuarios com privilegio, exceto o administrador
 *    em rotina de retencao documentada.
 *
 * Nao confundir com logs tecnicos (ver `nucleo/observabilidade`).
 */
export const eventosAuditoria = pgTable(
  "eventos_auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull().defaultNow(),
    /** Nulo quando a acao foi executada pelo sistema (tarefa agendada, importacao automatica). */
    usuarioId: text("usuario_id"),
    organizacaoId: uuid("organizacao_id"),
    empresaId: uuid("empresa_id"),
    /** Ex.: "conta_pagar.criada", "conciliacao.realizada", "usuario.permissao_alterada". */
    acao: text("acao").notNull(),
    /** Ex.: "conta_pagar", "movimentacao", "vinculo_usuario". */
    entidade: text("entidade").notNull(),
    entidadeId: text("entidade_id"),
    dadosAntes: jsonb("dados_antes"),
    dadosDepois: jsonb("dados_depois"),
    /** Origem do dado: "interface", "importacao", "api", "tarefa", "sistema". */
    origem: text("origem").notNull(),
    ip: text("ip"),
    agenteUsuario: text("agente_usuario"),
    requisicaoId: text("requisicao_id"),
  },
  (tabela) => [
    index("eventos_auditoria_empresa_data_idx").on(tabela.empresaId, tabela.ocorridoEm),
    index("eventos_auditoria_entidade_idx").on(tabela.entidade, tabela.entidadeId),
    index("eventos_auditoria_usuario_idx").on(tabela.usuarioId),
  ],
);
