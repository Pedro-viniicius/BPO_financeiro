import type { ReactNode } from "react";

import estilos from "./cabecalho-pagina.module.css";

export interface CabecalhoPaginaProps {
  readonly titulo: string;
  /**
   * Nome da empresa ativa. Repetido em toda pagina de propósito: lancar na
   * empresa errada e o erro mais caro do produto (docs/ux/personas-e-tarefas.md).
   */
  readonly empresa?: string;
  readonly descricao?: string;
  /** Acao primaria da tela. No maximo uma. */
  readonly acaoPrimaria?: ReactNode;
  readonly acoesSecundarias?: ReactNode;
}

/** Cabecalho padrao de toda tela: titulo, empresa ativa, descricao e acoes. */
export function CabecalhoPagina({
  titulo,
  empresa,
  descricao,
  acaoPrimaria,
  acoesSecundarias,
}: CabecalhoPaginaProps) {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.identificacao}>
        <h1 className={estilos.titulo}>
          {titulo}
          {empresa ? <span className={estilos.empresa}> · {empresa}</span> : null}
        </h1>
        {descricao ? <p className={estilos.descricao}>{descricao}</p> : null}
      </div>
      <div className={estilos.acoes}>
        {acoesSecundarias}
        {acaoPrimaria}
      </div>
    </header>
  );
}
