"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Botao } from "../botao/botao";

import estilos from "./dialogo-confirmacao.module.css";

export interface DialogoConfirmacaoProps {
  readonly aberto: boolean;
  /** Verbo + objeto, com interrogacao: "Estornar pagamento?". Nunca "Tem certeza?". */
  readonly titulo: string;
  /** O que exatamente sera afetado: valores, datas, codigos. */
  readonly resumo: ReactNode;
  /** Lista do que muda no sistema. Escrita em frases curtas. */
  readonly impactos?: readonly string[];
  /** Campo extra exigido pela acao (ex.: motivo do estorno). */
  readonly children?: ReactNode;
  /** Rotulo do botao de confirmacao: o VERBO da acao, nunca "OK". */
  readonly rotuloConfirmar: string;
  readonly aoConfirmar: () => void;
  readonly aoCancelar: () => void;
  readonly destrutivo?: boolean;
  readonly ocupado?: boolean;
  /** Impede a confirmacao enquanto algo obrigatorio faltar (ex.: motivo em branco). */
  readonly confirmacaoBloqueada?: boolean;
  readonly motivoBloqueio?: string;
}

/**
 * Dialogo de confirmacao de acao financeira.
 *
 * Usa o elemento nativo <dialog> com `showModal()`: o foco fica preso dentro,
 * `Esc` fecha e o fundo fica inerte sem nenhuma biblioteca.
 * Estrutura obrigatoria: titulo, resumo, impacto, botoes.
 * Ver docs/ux/estados-interface.md, secao 6.
 */
export function DialogoConfirmacao({
  aberto,
  titulo,
  resumo,
  impactos = [],
  children,
  rotuloConfirmar,
  aoConfirmar,
  aoCancelar,
  destrutivo = false,
  ocupado = false,
  confirmacaoBloqueada = false,
  motivoBloqueio,
}: DialogoConfirmacaoProps) {
  const referencia = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={referencia}
      className={estilos.dialogo}
      aria-labelledby="titulo-dialogo-confirmacao"
      onCancel={(evento) => {
        evento.preventDefault();
        aoCancelar();
      }}
    >
      <h2 id="titulo-dialogo-confirmacao" className={estilos.titulo}>
        {titulo}
      </h2>

      <div className={estilos.resumo}>{resumo}</div>

      {impactos.length > 0 ? (
        <>
          <p className={estilos.rotuloImpacto}>O que acontece:</p>
          <ul className={estilos.impactos}>
            {impactos.map((impacto) => (
              <li key={impacto}>{impacto}</li>
            ))}
          </ul>
        </>
      ) : null}

      {children ? <div className={estilos.campos}>{children}</div> : null}

      <div className={estilos.acoes}>
        <Botao variante="discreto" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao
          variante={destrutivo ? "perigo" : "primario"}
          onClick={aoConfirmar}
          ocupado={ocupado}
          disabled={confirmacaoBloqueada}
          {...(motivoBloqueio !== undefined ? { motivoDesabilitado: motivoBloqueio } : {})}
        >
          {rotuloConfirmar}
        </Botao>
      </div>
    </dialog>
  );
}
