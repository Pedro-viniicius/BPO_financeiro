"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import estilos from "./botao.module.css";

export type VarianteBotao = "primario" | "secundario" | "discreto" | "perigo";

export interface BotaoProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly variante?: VarianteBotao;
  readonly tamanho?: "normal" | "pequeno";
  /** Enquanto verdadeiro o botao fica ocupado e nao aceita novo clique (evita duplo envio). */
  readonly ocupado?: boolean;
  /** Texto exibido enquanto ocupado. Padrao: "Aguarde...". */
  readonly rotuloOcupado?: string;
  /** Motivo pelo qual o botao esta desabilitado, lido por leitores de tela e mostrado como dica. */
  readonly motivoDesabilitado?: string;
  readonly children: ReactNode;
}

/**
 * Botao padrao do produto.
 *
 * Regras de UX embutidas:
 * - acao de impacto sempre tem rotulo textual (nunca so icone);
 * - enquanto ocupado, o botao se bloqueia sozinho;
 * - desabilitado sem explicacao e proibido: `motivoDesabilitado` vira `title`
 *   e texto acessivel.
 */
export function Botao({
  variante = "secundario",
  tamanho = "normal",
  ocupado = false,
  rotuloOcupado = "Aguarde...",
  motivoDesabilitado,
  disabled,
  type = "button",
  children,
  ...resto
}: BotaoProps) {
  const desabilitado = disabled === true || ocupado;
  return (
    <button
      {...resto}
      type={type}
      className={`${estilos.botao} ${estilos[variante]} ${estilos[tamanho]}`}
      disabled={desabilitado}
      aria-busy={ocupado}
      {...(motivoDesabilitado !== undefined ? { title: motivoDesabilitado } : {})}
    >
      {ocupado ? rotuloOcupado : children}
      {motivoDesabilitado !== undefined && disabled === true ? (
        <span className="apenas-leitor-de-tela">. {motivoDesabilitado}</span>
      ) : null}
    </button>
  );
}
