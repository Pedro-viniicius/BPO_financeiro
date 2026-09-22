/**
 * Interface publica do modulo "bancos".
 * No Gate 5 entra apenas o minimo que as baixas exigem: contas bancarias e a
 * movimentacao gerada por pagamento/recebimento. Conciliacao, extrato e fluxo
 * de caixa sao Gate 6.
 */
export type {
  ContaBancariaNaLista,
  DadosNovaContaBancaria,
  RepositorioContasBancarias,
} from "./aplicacao/repositorio-contas-bancarias";
export { RepositorioContasBancariasDrizzle } from "./infraestrutura/repositorio-contas-bancarias-drizzle";
