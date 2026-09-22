/**
 * Interface publica do modulo "orcamento".
 * O planejado e gravado aqui; o realizado vem do modulo `dre`, a mesma fonte
 * da tela de Resultados. Outros modulos importam SOMENTE daqui.
 */
export {
  anoZerado,
  compararComOOrcado,
  distribuirNoAno,
  estourou,
  MESES_DO_ANO,
  naturezaDoGrupo,
  percentualDeExecucao,
  proporcaoDaBarra,
  reajustar,
  repetirNosDozeMeses,
  somaDoAno,
  type ExecucaoDoPeriodo,
  type NaturezaOrcada,
  type ValoresDoAno,
} from "./dominio/planilha-do-orcamento";
export type {
  AcompanhamentoDoOrcamento,
  GrupoDoAcompanhamento,
  LinhaDoAcompanhamento,
  LinhaDoPlanejamento,
  Planejamento,
  RepositorioOrcamento,
  ValorPlanejado,
} from "./aplicacao/repositorio-orcamento";
export { RepositorioOrcamentoDrizzle } from "./infraestrutura/repositorio-orcamento-drizzle";
