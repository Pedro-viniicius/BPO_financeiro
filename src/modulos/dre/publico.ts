/**
 * Interface publica do modulo "dre".
 * Modulo somente de leitura: classifica e soma o dinheiro que outros modulos
 * criaram. Outros modulos importam SOMENTE daqui.
 */
export {
  calcularSubtotais,
  contribuicaoNaLinha,
  ESTRUTURA_DRE,
  linhaDoLancamento,
  margemPercentual,
  variacaoPercentual,
  type DefinicaoDaLinha,
  type GrupoDre,
  type LinhaDre,
} from "./dominio/estrutura-dre";
export {
  ATALHOS,
  EXPLICACAO_REGIME,
  intervaloDoAtalho,
  mesesDoPeriodo,
  NOMES_ATALHO,
  NOMES_REGIME,
  REGIMES,
  type AtalhoDePeriodo,
  type IntervaloDoResultado,
  type MesDoResultado,
  type Regime,
} from "./dominio/periodo-do-resultado";
export {
  BOM_UTF8,
  campoCsv,
  montarCsvDoResultado,
  nomeDoArquivoCsv,
  numeroParaPlanilha,
  SEPARADOR_CSV,
  type CabecalhoDoCsv,
  type LinhaParaCsv,
} from "./dominio/csv-do-resultado";
export type {
  CategoriaNoResultado,
  FiltroResultado,
  IndicadoresDoResultado,
  LancamentoDoResultado,
  LinhaDoResultado,
  RepositorioDre,
  Resultado,
} from "./aplicacao/repositorio-dre";
export { RepositorioDreDrizzle } from "./infraestrutura/repositorio-dre-drizzle";
