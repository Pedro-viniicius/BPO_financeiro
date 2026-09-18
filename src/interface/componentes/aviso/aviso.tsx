import type { ReactNode } from "react";

import type { TomSemantico } from "../selo-situacao/selo-situacao";

import estilos from "./aviso.module.css";

const SIMBOLOS: Record<TomSemantico, string> = {
  neutro: "•",
  informacao: "i",
  sucesso: "✓",
  atencao: "!",
  perigo: "✕",
};

export interface AvisoProps {
  readonly tom?: TomSemantico;
  /** Frase curta que diz O QUE aconteceu. */
  readonly titulo: string;
  /** Explica POR QUE e O QUE FAZER. Nunca "Ocorreu um erro". */
  readonly children?: ReactNode;
  /** Acao sugerida ("Tentar novamente", "Ver conta parecida"). */
  readonly acao?: ReactNode;
  /** Avisos de erro sao anunciados imediatamente por leitores de tela. */
  readonly urgente?: boolean;
}

/**
 * Aviso em linha: erro de regra de negocio, alerta de duplicidade, explicacao
 * de permissao, resultado de importacao.
 *
 * Estrutura obrigatoria (docs/ux/estados-interface.md): o que aconteceu, por
 * que, o que fazer.
 */
export function Aviso({ tom = "informacao", titulo, children, acao, urgente = false }: AvisoProps) {
  return (
    <div
      className={`${estilos.aviso} ${estilos[tom]}`}
      role={urgente ? "alert" : "status"}
      aria-live={urgente ? "assertive" : "polite"}
    >
      <span className={estilos.simbolo} aria-hidden="true">
        {SIMBOLOS[tom]}
      </span>
      <div className={estilos.corpo}>
        <p className={estilos.titulo}>{titulo}</p>
        {children ? <div className={estilos.texto}>{children}</div> : null}
      </div>
      {acao ? <div className={estilos.acao}>{acao}</div> : null}
    </div>
  );
}
