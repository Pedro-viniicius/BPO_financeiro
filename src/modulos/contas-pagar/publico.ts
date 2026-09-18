/**
 * Interface publica do modulo "contas-pagar".
 * Outros modulos (fluxo de caixa, previsao, DRE) importam SOMENTE daqui.
 */
export {
  NOMES_SITUACOES,
  SITUACOES_CONTA_PAGAR,
  podeTransitar,
  type SituacaoContaPagar,
  type SituacaoExibida,
} from "./dominio/situacao-conta-pagar";
export {
  AprovacaoPeloProprioAutor,
  ContaPagarJaCancelada,
  ContaPagarNaoEncontrada,
  PagamentoJaRegistrado,
  TransicaoSituacaoInvalida,
} from "./dominio/erros";
export type { FiltroContasPagar, RepositorioContasPagar, ResumoContaPagar } from "./aplicacao/repositorio-contas-pagar";
