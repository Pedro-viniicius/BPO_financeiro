import { date, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Construtores de coluna padronizados. Garantem que todo valor monetario,
 * toda data de negocio e todo instante tecnico usem o mesmo tipo em todas as
 * tabelas (ADR-015 e docs/modelo-dados/padrao-nomenclatura.md).
 */

/** Valor monetario: NUMERIC(15,2). O driver devolve texto; a aplicacao converte em `Dinheiro`. */
export function colunaDinheiro(nome: string) {
  return numeric(nome, { precision: 15, scale: 2 });
}

/** Percentual/taxa com 4 casas (ex.: 1.2500 = 1,25%). Corresponde a `Percentual`. */
export function colunaPercentual(nome: string) {
  return numeric(nome, { precision: 9, scale: 4 });
}

/** Data civil de negocio (vencimento, competencia, pagamento...). Sem hora, sem fuso. */
export function colunaDataCivil(nome: string) {
  return date(nome, { mode: "string" });
}

/** Instante tecnico em UTC. */
export function colunaInstante(nome: string) {
  return timestamp(nome, { withTimezone: true });
}

/** Par padrao de instantes tecnicos presente em toda tabela mutavel. */
export function colunasTecnicas() {
  return {
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
    atualizadoEm: colunaInstante("atualizado_em").notNull().defaultNow(),
  };
}
