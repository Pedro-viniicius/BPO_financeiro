/**
 * Interface publica do modulo "bancos".
 * Entram as contas bancarias, o extrato com saldo acumulado e o lancamento de
 * ajuste. Conciliacao, importacao de extrato e fluxo de caixa sao Gate 6.
 */
export type {
  ContaBancariaNaLista,
  DadosAjusteDeSaldo,
  DadosEdicaoContaBancaria,
  DadosNovaContaBancaria,
  LinhaDoExtrato,
  RepositorioContasBancarias,
} from "./aplicacao/repositorio-contas-bancarias";
export { RepositorioContasBancariasDrizzle } from "./infraestrutura/repositorio-contas-bancarias-drizzle";
