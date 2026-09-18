import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Outbox transacional ("caixa de saida").
 *
 * Quando uma operacao financeira precisa avisar outros modulos ou sistemas
 * externos (ex.: "pagamento registrado" -> criar movimentacao, notificar,
 * enviar para integracao), o evento e gravado NESTA tabela dentro da MESMA
 * transacao da operacao. Um processo separado le os eventos nao publicados e
 * os entrega. Assim, ou a operacao e o evento sao gravados juntos, ou nenhum.
 * Ver ADR-012.
 */
export const eventosSaida = pgTable(
  "eventos_saida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Ex.: "conta_pagar.pagamento_registrado". */
    nome: text("nome").notNull(),
    organizacaoId: uuid("organizacao_id"),
    empresaId: uuid("empresa_id"),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull().defaultNow(),
    usuarioId: text("usuario_id"),
    dados: jsonb("dados").notNull(),
    publicadoEm: timestamp("publicado_em", { withTimezone: true }),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
  },
  (tabela) => [index("eventos_saida_pendentes_idx").on(tabela.publicadoEm, tabela.ocorridoEm)],
);
