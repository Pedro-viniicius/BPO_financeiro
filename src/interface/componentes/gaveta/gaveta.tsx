"use client";

import { useEffect, useRef, type ReactNode } from "react";

import estilos from "./gaveta.module.css";

export interface GavetaProps {
  readonly aberta: boolean;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly aoFechar: () => void;
  /** Acoes fixas no rodape da gaveta (salvar, cancelar). */
  readonly rodape?: ReactNode;
}

/**
 * Painel lateral para consulta ou edicao rapida sem perder a lista de tras.
 *
 * Quando usar gaveta, pagina ou dialogo: ADR-022.
 * Tambem usa <dialog> nativo — o foco fica preso e `Esc` fecha.
 */
export function Gaveta({ aberta, titulo, children, aoFechar, rodape }: GavetaProps) {
  const referencia = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;
    if (aberta && !elemento.open) elemento.showModal();
    if (!aberta && elemento.open) elemento.close();
  }, [aberta]);

  return (
    <dialog
      ref={referencia}
      className={estilos.gaveta}
      aria-labelledby="titulo-gaveta"
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
    >
      <header className={estilos.cabecalho}>
        <h2 id="titulo-gaveta" className={estilos.titulo}>
          {titulo}
        </h2>
        <button type="button" className={estilos.fechar} onClick={aoFechar} aria-label="Fechar">
          ✕
        </button>
      </header>
      <div className={estilos.corpo}>{children}</div>
      {rodape ? <footer className={estilos.rodape}>{rodape}</footer> : null}
    </dialog>
  );
}
