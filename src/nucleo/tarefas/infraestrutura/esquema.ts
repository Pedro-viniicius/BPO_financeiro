import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Fila de tarefas em segundo plano, guardada no PostgreSQL.
 *
 * Exemplos de tarefa: importar OFX, recalcular previsao, gerar relatorio,
 * publicar eventos de saida. Um executor le tarefas pendentes com
 * `SELECT ... FOR UPDATE SKIP LOCKED` (varios executores podem rodar sem
 * pegar a mesma tarefa). Ver ADR-012 e docs/arquitetura/tarefas.md.
 */
export const tarefas = pgTable(
  "tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Ex.: "importacao.processar_ofx", "eventos.publicar_saida". */
    tipo: text("tipo").notNull(),
    dados: jsonb("dados").notNull(),
    /** pendente | executando | concluida | falhou */
    estado: text("estado").notNull().default("pendente"),
    agendadaPara: timestamp("agendada_para", { withTimezone: true }).notNull().defaultNow(),
    tentativas: integer("tentativas").notNull().default(0),
    maximoTentativas: integer("maximo_tentativas").notNull().default(5),
    ultimoErro: text("ultimo_erro"),
    /** Evita enfileirar a mesma tarefa duas vezes (ex.: mesmo arquivo importado). */
    chaveIdempotencia: text("chave_idempotencia"),
    organizacaoId: uuid("organizacao_id"),
    empresaId: uuid("empresa_id"),
    usuarioId: text("usuario_id"),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
  },
  (tabela) => [
    index("tarefas_pendentes_idx").on(tabela.estado, tabela.agendadaPara),
    uniqueIndex("tarefas_chave_idempotencia_idx").on(tabela.chaveIdempotencia),
  ],
);
