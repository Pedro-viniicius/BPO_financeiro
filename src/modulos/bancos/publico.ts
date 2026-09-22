/**
 * Interface publica do modulo "bancos".
 * Contas bancarias, extrato com saldo acumulado, lancamento de ajuste e
 * transferencia entre contas proprias.
 */
export type {
  ContaBancariaNaLista,
  DadosAjusteDeSaldo,
  DadosEdicaoContaBancaria,
  DadosEstornoTransferencia,
  DadosNovaContaBancaria,
  DadosNovaTransferencia,
  LinhaDoExtrato,
  RepositorioContasBancarias,
  TransferenciaNaLista,
} from "./aplicacao/repositorio-contas-bancarias";
export { RepositorioContasBancariasDrizzle } from "./infraestrutura/repositorio-contas-bancarias-drizzle";
