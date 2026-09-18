/**
 * Portao de recursos ("feature gate": chave que diz se um recurso esta
 * habilitado nesta instalacao).
 *
 * O dominio financeiro NUNCA le a licenca. Ele pergunta a este contrato:
 * "o recurso X esta habilitado?". Assim, as regras comerciais (o que vem em
 * cada versao/contrato) podem mudar sem tocar no financeiro. Ver ADR-013.
 */
export const RECURSOS = [
  "operacao_financeira",
  "tesouraria",
  "controle_gerencial",
  "importacao_ofx",
  "importacao_csv",
  "conciliacao_bancaria",
  "cobranca",
  "faturamento",
  "orcamento",
  "analises_ia",
  "integracao_bancaria",
  "integracao_contabil",
  "multiempresa",
] as const;

export type Recurso = (typeof RECURSOS)[number];

export interface PortaoRecursos {
  estaHabilitado(recurso: Recurso): boolean;
  recursosHabilitados(): ReadonlySet<Recurso>;
}

/** Recursos incluidos na versao 1.x sem contratacao adicional. */
export const RECURSOS_BASE_VERSAO_1: readonly Recurso[] = [
  "operacao_financeira",
  "tesouraria",
  "controle_gerencial",
  "importacao_ofx",
  "importacao_csv",
  "conciliacao_bancaria",
  "cobranca",
  "faturamento",
  "orcamento",
  "multiempresa",
];

/** Recursos que dependem de contratacao separada (consumo de IA, integracoes). */
export const RECURSOS_CONTRATADOS_SEPARADAMENTE: readonly Recurso[] = [
  "analises_ia",
  "integracao_bancaria",
  "integracao_contabil",
];
