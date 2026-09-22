/**
 * Interface publica do modulo "conciliacao-bancaria".
 * Outros modulos importam SOMENTE daqui.
 */
export { ArquivoOfxInvalido, dataDoOfx, decodificarOfx, lerOfx, valorDoOfx, type ExtratoOfx, type LancamentoOfx } from "./dominio/ofx";
export {
  ConciliacaoDesequilibrada,
  confiancaDeConciliacaoManual,
  JANELA_DE_DIAS,
  sugerirConciliacoes,
  validarConciliacao,
  type Candidata,
  type ConfiancaConciliacao,
  type ItemParaCasar,
  type MovimentacaoParaCasar,
  type SugestaoDeConciliacao,
} from "./dominio/sugestao-de-conciliacao";
export type {
  DadosBaixaDoItem,
  DadosConciliacao,
  DadosImportacaoOfx,
  DadosLancamentoDoItem,
  ImportacaoNaLista,
  ItemDoExtrato,
  MovimentacaoPendente,
  PainelDeConciliacao,
  RepositorioConciliacao,
  ResultadoImportacao,
  ResumoDaConciliacao,
} from "./aplicacao/repositorio-conciliacao";
export { RepositorioConciliacaoDrizzle } from "./infraestrutura/repositorio-conciliacao-drizzle";
