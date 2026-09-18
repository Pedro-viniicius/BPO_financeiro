import type { ReactNode } from "react";

import estilos from "./estado-vazio.module.css";

export interface EstadoVazioProps {
  /** O que e esta lista, em uma frase ("Nenhuma conta a pagar ainda"). */
  readonly titulo: string;
  /** Por que esta vazio e o que aparece aqui quando houver dados. */
  readonly explicacao: string;
  /** O proximo passo possivel. Todo estado vazio tem um — exceto os que sao boa noticia. */
  readonly acao?: ReactNode;
  /** Link de ajuda, quando o assunto exige aprendizado (ex.: baixar OFX no banco). */
  readonly ajuda?: ReactNode;
  /**
   * `vazio` = nunca houve dado; `filtrado` = ha dados, mas o filtro nao
   * encontrou nada. Oferecer "criar" para quem filtrou errado e resposta ruim.
   */
  readonly motivo?: "vazio" | "filtrado";
}

/** Estado vazio padrao: o que e, por que esta vazio, o que fazer agora. */
export function EstadoVazio({ titulo, explicacao, acao, ajuda, motivo = "vazio" }: EstadoVazioProps) {
  return (
    <div className={estilos.area} data-motivo={motivo}>
      <p className={estilos.titulo}>{titulo}</p>
      <p className={estilos.explicacao}>{explicacao}</p>
      {acao ? <div className={estilos.acao}>{acao}</div> : null}
      {ajuda ? <div className={estilos.ajuda}>{ajuda}</div> : null}
    </div>
  );
}
