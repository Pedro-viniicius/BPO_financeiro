/**
 * Interface publica do modulo "fluxo-caixa".
 * Modulo somente de leitura: organiza no tempo o dinheiro que outros modulos
 * criaram. Outros modulos importam SOMENTE daqui.
 */
export {
  fimDaSemana,
  gerarPeriodos,
  GRANULARIDADES,
  inicioDaSemana,
  NOMES_GRANULARIDADE,
  periodoPadrao,
  type Granularidade,
  type IntervaloDoFluxo,
  type NaturezaDoPeriodo,
} from "./dominio/periodos";
export type {
  FiltroFluxo,
  FluxoDeCaixa,
  LancamentoDoFluxo,
  LinhaDoFluxo,
  LinhaPorCategoria,
  ParcelaPrevista,
  RepositorioFluxoCaixa,
  TotaisEmAtraso,
} from "./aplicacao/repositorio-fluxo-caixa";
export { RepositorioFluxoCaixaDrizzle } from "./infraestrutura/repositorio-fluxo-caixa-drizzle";
