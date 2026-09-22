/**
 * Situacoes de um TITULO a pagar.
 *
 * Reconciliado com o modelo do Gate 3. O esqueleto anterior (escrito no Gate 2,
 * antes do banco existir) falava em "pendente", "agendada" e "paga" — nenhuma
 * dessas existe no enum `situacao_titulo`, e "paga" nao podia existir mesmo:
 * ela e DERIVADA das parcelas (docs/modelo-dados/categorias/contas-pagar.md).
 * Onde codigo e banco divergiam, o banco venceu.
 *
 * O titulo e a obrigacao (a nota, o contrato). Quanto foi pago e se venceu sao
 * perguntas da PARCELA — ver `compartilhado/financeiro/baixa-de-parcela.ts`.
 */
export const SITUACOES_TITULO_PAGAR = ["rascunho", "aguardando_aprovacao", "aberto", "cancelado"] as const;

export type SituacaoTituloPagar = (typeof SITUACOES_TITULO_PAGAR)[number];

export const NOMES_SITUACAO_TITULO: Record<SituacaoTituloPagar, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  aberto: "Em aberto",
  cancelado: "Cancelado",
};

/**
 * Transicoes permitidas. Cancelado e terminal de proposito: desfazer um
 * cancelamento apagaria o motivo registrado e a data. Para "reabrir", cria-se
 * um titulo novo, e o historico dos dois continua legivel.
 */
export const TRANSICOES_PERMITIDAS: Record<SituacaoTituloPagar, readonly SituacaoTituloPagar[]> = {
  rascunho: ["aguardando_aprovacao", "aberto", "cancelado"],
  aguardando_aprovacao: ["aberto", "rascunho", "cancelado"],
  aberto: ["cancelado"],
  cancelado: [],
};

export function podeTransitar(de: SituacaoTituloPagar, para: SituacaoTituloPagar): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}
