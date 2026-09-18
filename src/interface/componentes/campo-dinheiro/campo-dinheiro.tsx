"use client";

import { useState } from "react";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import estilos from "./campo-dinheiro.module.css";

export interface CampoDinheiroProps {
  readonly id: string;
  /** Valor canonico atual ("1234.56") ou vazio. */
  readonly valor: string;
  /**
   * Recebe o valor canonico quando o texto digitado e valido, ou `null`
   * enquanto nao for. A interface nunca calcula: ela apenas converte texto.
   */
  readonly aoAlterar: (valorCanonico: string | null) => void;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-invalid"?: boolean | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}

/** Converte o texto canonico em texto brasileiro para edicao ("1234.56" -> "1.234,56"). */
function paraTextoBrasileiro(valorCanonico: string): string {
  if (valorCanonico === "") return "";
  try {
    return Dinheiro.deTexto(valorCanonico).formatarBrasileiro().replace("R$ ", "");
  } catch {
    return valorCanonico;
  }
}

/**
 * Campo de valor monetario.
 *
 * Decisoes de UX (docs/ux/formularios.md, secao 4):
 * - e `type="text"` com `inputMode="decimal"`, nunca `type="number"`: a roda do
 *   mouse sobre um campo numerico altera valores financeiros sem querer;
 * - o simbolo `R$` fica fora da area editavel;
 * - aceita "1234,56", "1.234,56" e "1234.56";
 * - alinhado a direita, com algarismos de largura fixa.
 */
export function CampoDinheiro({
  id,
  valor,
  aoAlterar,
  required = false,
  disabled = false,
  autoFocus = false,
  ...acessibilidade
}: CampoDinheiroProps) {
  const [texto, definirTexto] = useState(() => paraTextoBrasileiro(valor));

  function aoDigitar(novoTexto: string) {
    definirTexto(novoTexto);
    if (novoTexto.trim() === "") {
      aoAlterar(null);
      return;
    }
    try {
      aoAlterar(Dinheiro.deTextoBrasileiro(novoTexto).paraTexto());
    } catch {
      aoAlterar(null);
    }
  }

  function aoSair() {
    if (texto.trim() === "") return;
    try {
      definirTexto(Dinheiro.deTextoBrasileiro(texto).formatarBrasileiro().replace("R$ ", ""));
    } catch {
      /* Texto invalido permanece como o usuario digitou; o erro e mostrado pelo campo. */
    }
  }

  return (
    <div className={estilos.moldura}>
      <span className={estilos.simbolo} aria-hidden="true">
        R$
      </span>
      <input
        {...acessibilidade}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={estilos.campo}
        value={texto}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="0,00"
        onChange={(evento) => aoDigitar(evento.target.value)}
        onBlur={aoSair}
      />
    </div>
  );
}
