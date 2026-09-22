/**
 * Interface publica do modulo "contas-receber".
 * Outros modulos importam SOMENTE daqui.
 */
export {
  NOMES_SITUACAO_TITULO_RECEBER,
  podeTransitar,
  SITUACOES_TITULO_RECEBER,
  type SituacaoTituloReceber,
} from "./dominio/situacao-titulo-receber";
export { ContaReceberJaCancelada, ContaReceberNaoEncontrada, EdicaoBloqueadaPorRecebimento } from "./dominio/erros";
export type {
  ContaReceberDetalhada,
  ContaReceberNaLista,
  DadosCancelamento,
  DadosEdicaoContaReceber,
  DadosEstorno,
  DadosNovaContaReceber,
  DadosRecebimento,
  FiltroContasReceber,
  ParcelaIrma,
  RecebimentoRegistrado,
  RepositorioContasReceber,
} from "./aplicacao/repositorio-contas-receber";
export { RepositorioContasReceberDrizzle } from "./infraestrutura/repositorio-contas-receber-drizzle";
