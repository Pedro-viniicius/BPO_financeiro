import type { ContextoFinanceiro } from "./contexto-financeiro";

/**
 * Pergunta enviada a IA. Apenas texto do usuario + contexto calculado.
 */
export interface PerguntaFinanceira {
  readonly pergunta: string;
  readonly contexto: ContextoFinanceiro;
}

/**
 * Resposta estruturada em blocos fixos (ver Gate 1, jornada J8).
 * A IA interpreta; nunca produz numeros novos — os numeros citados devem vir
 * do contexto, e `dadosUsados` lista quais foram usados.
 */
export interface AnaliseFinanceira {
  readonly conclusao: string;
  readonly dadosUsados: readonly string[];
  readonly premissas: readonly string[];
  readonly calculo: string;
  readonly incerteza: string;
  readonly cenarios: readonly { readonly descricao: string; readonly consequencia: string }[];
  readonly provedor: string;
  readonly modelo: string;
}

/**
 * Porta para provedores de IA (Anthropic, OpenAI, DeepSeek, modelo local...).
 * SOMENTE LEITURA: o contrato nao oferece nenhuma acao sobre o sistema.
 * Ver ADR-010.
 */
export interface ProvedorInteligenciaArtificial {
  readonly nome: string;
  analisar(pergunta: PerguntaFinanceira): Promise<AnaliseFinanceira>;
}
