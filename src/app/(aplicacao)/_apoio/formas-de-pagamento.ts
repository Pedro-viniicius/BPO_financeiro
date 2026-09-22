/**
 * As formas de pagamento aceitas, na ordem em que aparecem na tela.
 *
 * Os valores sao exatamente os do enum `forma_pagamento` do banco. Ficam aqui
 * para que a validacao (Zod) e o `<select>` usem a MESMA lista: quando as duas
 * viviam separadas, um valor fora do enum passava pela validacao e so estourava
 * na hora de gravar, com erro tecnico na cara do usuario.
 */
export const FORMAS_DE_PAGAMENTO = [
  "pix",
  "boleto",
  "transferencia",
  "debito_automatico",
  "cartao_credito",
  "cartao_debito",
  "dinheiro",
  "cheque",
  "outro",
] as const;

export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];

export const NOMES_FORMA_PAGAMENTO: Record<FormaDePagamento, string> = {
  pix: "PIX",
  boleto: "Boleto",
  transferencia: "Transferência",
  debito_automatico: "Débito automático",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  cheque: "Cheque",
  outro: "Outro",
};
