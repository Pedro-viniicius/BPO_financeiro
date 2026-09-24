"use client";

import { useState } from "react";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import estilos from "./campo-dinheiro.module.css";

export interface CampoDinheiroProps {
  readonly id: string;
  /**
   * Nome do campo no formulario. E o que faz o valor CHEGAR ao servidor.
   *
   * Sem ele o componente era inutilizavel neste projeto, e foi por isso que
   * nunca foi usado: aqui todo formulario e enviado nativamente, para
   * funcionar sem JavaScript, e um campo sem `name` simplesmente nao viaja.
   * O valor enviado e o TEXTO BRASILEIRO que aparece na tela ("1.234,56"),
   * que e o que as acoes de servidor ja sabem ler.
   */
  readonly name: string;
  /** Valor canonico inicial ("1234.56") ou vazio. */
  readonly valor: string;
  /**
   * Avisa a tela quando o valor muda: recebe o valor canonico se o texto for
   * valido, ou `null` enquanto nao for. Opcional — serve a quem precisa
   * reagir ao valor (somar parcelas, habilitar botao), nao ao envio.
   */
  readonly aoAlterar?: (valorCanonico: string | null) => void;
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
 * - alinhado a direita, com algarismos de largura fixa;
 * - tem `name`, entao e enviado por formulario nativo e funciona sem
 *   JavaScript: sem JS o campo apenas nao reformata ao sair, e o texto
 *   digitado ("1234,56") e aceito do mesmo jeito pela acao de servidor.
 */
export function CampoDinheiro({
  id,
  name,
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
    if (!aoAlterar) return;
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
        name={name}
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
