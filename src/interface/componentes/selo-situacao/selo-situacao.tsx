import estilos from "./selo-situacao.module.css";

/** Tom semantico compartilhado por selos, avisos e cartoes. */
export type TomSemantico = "neutro" | "informacao" | "sucesso" | "atencao" | "perigo";

/**
 * Simbolo textual que acompanha o rotulo. Existe para que a situacao seja
 * legivel sem depender de cor (docs/ux/acessibilidade.md).
 */
const SIMBOLOS: Record<TomSemantico, string> = {
  neutro: "•",
  informacao: "i",
  sucesso: "✓",
  atencao: "!",
  perigo: "✕",
};

export interface SeloSituacaoProps {
  /** Texto da situacao, em portugues, como o usuario a conhece ("Vencido há 3 dias"). */
  readonly rotulo: string;
  readonly tom?: TomSemantico;
  /** Substitui o simbolo padrao do tom (ex.: "◐" para parcialmente conciliado). */
  readonly simbolo?: string;
  /** Explicacao curta mostrada ao passar o mouse e lida por leitores de tela. */
  readonly explicacao?: string;
}

/**
 * Selo de situacao financeira.
 *
 * O componente nao sabe o que e "vencido": ele recebe o rotulo e o tom ja
 * decididos pela camada de apresentacao (ver ADR-024). Assim a regra de
 * negocio nao se duplica na interface.
 */
export function SeloSituacao({ rotulo, tom = "neutro", simbolo, explicacao }: SeloSituacaoProps) {
  const marca = simbolo ?? SIMBOLOS[tom];
  return (
    <span className={`${estilos.selo} ${estilos[tom]}`} title={explicacao ?? rotulo}>
      <span className={estilos.simbolo} aria-hidden="true">
        {marca}
      </span>
      <span>{rotulo}</span>
      {explicacao ? <span className="apenas-leitor-de-tela">. {explicacao}</span> : null}
    </span>
  );
}
