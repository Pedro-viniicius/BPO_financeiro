import type { ReactNode } from "react";

import estilos from "./secao-formulario.module.css";

export interface SecaoFormularioProps {
  /** Um dos nomes padrao: Informações principais, Financeiro, Classificação, Documentos, Informações adicionais. */
  readonly titulo: string;
  /** Explica o vocabulario tecnico em uma linha, quando houver. */
  readonly explicacao?: string;
  readonly children: ReactNode;
  /**
   * Secao recolhida por padrao. NUNCA use em secao que contenha campo
   * obrigatorio (docs/ux/formularios.md, secao 1).
   */
  readonly recolhida?: boolean;
}

/**
 * Agrupa campos por significado usando <fieldset>/<legend> — o agrupamento e
 * anunciado por leitores de tela, nao apenas desenhado.
 */
export function SecaoFormulario({ titulo, explicacao, children, recolhida = false }: SecaoFormularioProps) {
  if (recolhida) {
    return (
      <details className={estilos.secao}>
        <summary className={estilos.resumo}>
          {titulo}
          {explicacao ? <span className={estilos.explicacao}>{explicacao}</span> : null}
        </summary>
        <div className={estilos.campos}>{children}</div>
      </details>
    );
  }

  return (
    <fieldset className={estilos.secao}>
      <legend className={estilos.legenda}>{titulo}</legend>
      {explicacao ? <p className={estilos.explicacao}>{explicacao}</p> : null}
      <div className={estilos.campos}>{children}</div>
    </fieldset>
  );
}
