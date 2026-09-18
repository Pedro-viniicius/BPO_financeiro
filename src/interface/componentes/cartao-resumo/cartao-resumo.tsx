import type { ReactNode } from "react";

import type { TomSemantico } from "../selo-situacao/selo-situacao";

import estilos from "./cartao-resumo.module.css";

export interface CartaoResumoProps {
  /** Pergunta ou resposta, nunca o nome do calculo ("Disponível hoje"). */
  readonly titulo: string;
  /** Normalmente um `ValorFinanceiro`. */
  readonly valor: ReactNode;
  /** Explicacao de uma linha, em linguagem simples. */
  readonly explicacao?: string;
  /** Contagem associada ("6 contas"). */
  readonly contagem?: string;
  readonly tom?: TomSemantico;
  /** Quando informado, o cartao inteiro vira um filtro/atalho clicavel. */
  readonly aoClicar?: () => void;
  readonly rodape?: ReactNode;
}

/**
 * Cartao de resumo usado no Inicio e no topo das listagens.
 *
 * Quando `aoClicar` e informado, o cartao e renderizado como <button> — nunca
 * como <div> com clique — para funcionar por teclado.
 */
export function CartaoResumo({
  titulo,
  valor,
  explicacao,
  contagem,
  tom = "neutro",
  aoClicar,
  rodape,
}: CartaoResumoProps) {
  const conteudo = (
    <>
      <p className={estilos.titulo}>{titulo}</p>
      <div className={estilos.valor}>{valor}</div>
      {contagem ? <p className={estilos.contagem}>{contagem}</p> : null}
      {explicacao ? <p className={estilos.explicacao}>{explicacao}</p> : null}
      {rodape ? <div className={estilos.rodape}>{rodape}</div> : null}
    </>
  );

  const classe = `${estilos.cartao} ${estilos[tom]}`;

  if (aoClicar) {
    return (
      <button type="button" className={`${classe} ${estilos.clicavel}`} onClick={aoClicar}>
        {conteudo}
      </button>
    );
  }

  return <section className={classe}>{conteudo}</section>;
}
