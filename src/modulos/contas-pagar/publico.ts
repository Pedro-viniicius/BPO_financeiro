/**
 * Interface publica do modulo "contas-pagar".
 * Outros modulos (fluxo de caixa, previsao, DRE) importam SOMENTE daqui.
 */
export {
  NOMES_SITUACAO_TITULO,
  podeTransitar,
  SITUACOES_TITULO_PAGAR,
  type SituacaoTituloPagar,
} from "./dominio/situacao-titulo-pagar";
export {
  AprovacaoPeloProprioAutor,
  ContaPagarJaCancelada,
  ContaPagarNaoEncontrada,
  EdicaoBloqueadaPorPagamento,
  PagamentoJaRegistrado,
  TransicaoSituacaoInvalida,
} from "./dominio/erros";
export type {
  ContaPagarDetalhada,
  ContaPagarNaLista,
  DadosEdicaoContaPagar,
  DadosNovaContaPagar,
  DadosPagamento,
  FiltroContasPagar,
  PagamentoRegistrado,
  RepositorioContasPagar,
} from "./aplicacao/repositorio-contas-pagar";
export { RepositorioContasPagarDrizzle } from "./infraestrutura/repositorio-contas-pagar-drizzle";
