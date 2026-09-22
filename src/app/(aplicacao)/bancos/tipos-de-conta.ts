/**
 * Os tipos de conta bancaria, com o nome que o usuario le.
 *
 * Os valores sao os do enum `tipo_conta_bancaria` do banco. Uma lista so, para
 * a lista de contas, o formulario de cadastro e o de edicao nao divergirem.
 */
export const TIPOS_DE_CONTA = ["conta_corrente", "conta_poupanca", "conta_pagamento", "aplicacao", "caixa"] as const;

export type TipoDeConta = (typeof TIPOS_DE_CONTA)[number];

export const NOMES_TIPO_CONTA: Record<string, string> = {
  conta_corrente: "Conta corrente",
  conta_poupanca: "Conta poupança",
  conta_pagamento: "Conta de pagamento",
  aplicacao: "Aplicação",
  caixa: "Caixa (dinheiro em espécie)",
};
