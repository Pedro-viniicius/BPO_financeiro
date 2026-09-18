/**
 * Situacoes de uma conta a pagar (ver glossario, secao 3).
 *
 * "vencida" NAO e gravada: e derivada (pendente/agendada com vencimento no
 * passado). Assim nunca existe rotina noturna para "marcar vencidos".
 */
export const SITUACOES_CONTA_PAGAR = [
  "rascunho",
  "aguardando_aprovacao",
  "pendente",
  "agendada",
  "paga",
  "cancelada",
] as const;

export type SituacaoContaPagar = (typeof SITUACOES_CONTA_PAGAR)[number];

/** Situacao exibida ao usuario, incluindo a derivada "vencida". */
export type SituacaoExibida = SituacaoContaPagar | "vencida";

export const NOMES_SITUACOES: Record<SituacaoExibida, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovacao",
  pendente: "Pendente",
  agendada: "Agendada",
  vencida: "Vencida",
  paga: "Paga",
  cancelada: "Cancelada",
};

/** Transicoes permitidas. Qualquer outra e rejeitada com erro de dominio. */
export const TRANSICOES_PERMITIDAS: Record<SituacaoContaPagar, readonly SituacaoContaPagar[]> = {
  rascunho: ["pendente", "aguardando_aprovacao", "cancelada"],
  aguardando_aprovacao: ["pendente", "rascunho", "cancelada"],
  pendente: ["agendada", "paga", "cancelada"],
  agendada: ["pendente", "paga", "cancelada"],
  paga: ["pendente"], // "Desfazer pagamento"
  cancelada: [],
};

export function podeTransitar(de: SituacaoContaPagar, para: SituacaoContaPagar): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}
