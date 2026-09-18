import type { ContextoFinanceiro } from "./contratos/contexto-financeiro";

/**
 * Politica de dados: decide o que PODE sair da aplicacao rumo a um provedor
 * externo de IA. Ver docs/arquitetura/inteligencia-artificial.md, secao
 * "O que sai da aplicacao".
 *
 * Regras:
 * 1. Somente os campos de `ContextoFinanceiro`. Nada alem disso.
 * 2. Nunca nomes de pessoas fisicas, CPF, dados bancarios, e-mails.
 * 3. Textos livres (descricoes de lancamentos) nao entram no contexto —
 *    apenas categorias e totais.
 * 4. Um provedor "local" pode receber mais detalhe no futuro; hoje a politica e unica.
 */
const CAMPOS_PERMITIDOS_RAIZ: ReadonlySet<keyof ContextoFinanceiro> = new Set([
  "empresa",
  "periodo",
  "moeda",
  "caixa",
  "contasReceber",
  "contasPagar",
  "dreMensal",
  "variacaoOrcamento",
  "capitalGiro",
  "pontosAtencao",
]);

const EXPRESSAO_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const EXPRESSAO_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface ResultadoPolitica {
  readonly permitido: boolean;
  readonly motivos: readonly string[];
  readonly contextoFiltrado: ContextoFinanceiro;
}

/** Remove campos nao previstos e bloqueia se detectar dado pessoal em texto. */
export function aplicarPoliticaDados(contexto: ContextoFinanceiro): ResultadoPolitica {
  const motivos: string[] = [];
  const filtrado: Record<string, unknown> = {};

  for (const [chave, valor] of Object.entries(contexto)) {
    if (CAMPOS_PERMITIDOS_RAIZ.has(chave as keyof ContextoFinanceiro)) {
      filtrado[chave] = valor;
    } else {
      motivos.push(`Campo "${chave}" removido: nao faz parte do contexto permitido.`);
    }
  }

  const textoCompleto = JSON.stringify(filtrado);
  if (EXPRESSAO_CPF.test(textoCompleto)) {
    motivos.push("Contexto contem algo parecido com CPF; envio bloqueado.");
  }
  if (EXPRESSAO_EMAIL.test(textoCompleto)) {
    motivos.push("Contexto contem e-mail; envio bloqueado.");
  }

  const permitido = !motivos.some((motivo) => motivo.includes("bloqueado"));
  return { permitido, motivos, contextoFiltrado: filtrado as unknown as ContextoFinanceiro };
}
