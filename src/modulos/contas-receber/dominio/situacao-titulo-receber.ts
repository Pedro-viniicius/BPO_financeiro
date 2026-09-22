/**
 * Situacoes de um TITULO a receber.
 *
 * Usa o mesmo enum `situacao_titulo` de contas a pagar — sao os mesmos quatro
 * estados de vida de uma obrigacao. "Recebido" nao esta aqui: e derivado das
 * parcelas, como "pago" do outro lado.
 *
 * A diferenca real entre os dois modulos esta na PARCELA: so contas a receber
 * tem `perdida` (inadimplencia reconhecida). Ninguem "perde" uma conta a pagar.
 */
export const SITUACOES_TITULO_RECEBER = ["rascunho", "aguardando_aprovacao", "aberto", "cancelado"] as const;

export type SituacaoTituloReceber = (typeof SITUACOES_TITULO_RECEBER)[number];

export const NOMES_SITUACAO_TITULO_RECEBER: Record<SituacaoTituloReceber, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  aberto: "Em aberto",
  cancelado: "Cancelado",
};

export const TRANSICOES_PERMITIDAS: Record<SituacaoTituloReceber, readonly SituacaoTituloReceber[]> = {
  rascunho: ["aguardando_aprovacao", "aberto", "cancelado"],
  aguardando_aprovacao: ["aberto", "rascunho", "cancelado"],
  aberto: ["cancelado"],
  cancelado: [],
};

export function podeTransitar(de: SituacaoTituloReceber, para: SituacaoTituloReceber): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}
