"use client";

import type { ReactNode } from "react";

import estilos from "./dobra.module.css";

export interface DobraProps {
  /** O texto do gatilho. Descreve a AÇÃO ("Estornar"), não o objeto. */
  readonly rotulo: string;
  readonly children: ReactNode;
  /**
   * Para a ação principal daquele bloco. Só uma dobra por área deve ter
   * destaque — se todas tiverem, nenhuma tem.
   */
  readonly destaque?: boolean;
  /**
   * Quando informados, quem controla a abertura é a tela. Serve para FECHAR
   * a dobra depois que a ação termina; sem isso ela ficaria aberta, com o
   * formulário já enviado à vista.
   *
   * Sem eles, a dobra abre e fecha sozinha, pelo próprio navegador — o que
   * basta na maioria dos casos e funciona sem JavaScript.
   */
  readonly aberta?: boolean;
  readonly aoAlternar?: (aberta: boolean) => void;
  /** Envolve o conteúdo numa caixa com respiro. Desligue quando o filho já é uma caixa. */
  readonly comCaixa?: boolean;
}

/**
 * Dobra: um gatilho que revela um formulário ou um detalhe.
 *
 * `<details>` e `<summary>` de verdade, e não um botão com estado. A escolha
 * decide três coisas de uma vez: abre e fecha SEM JavaScript, responde ao
 * teclado sozinho e já anuncia o estado (aberto/fechado) a leitores de tela
 * sem nenhum `aria-*` escrito à mão. Com `<button onClick>`, estornar uma
 * baixa viraria a única operação do sistema que exige JavaScript.
 *
 * Existe como componente porque o mesmo controle estava copiado em NOVE
 * arquivos de estilo e já tinha divergido em duas aparências — a mesma ação,
 * com tamanho e respiro diferentes conforme a tela em que a pessoa estivesse.
 */
export function Dobra({ rotulo, children, destaque, aberta, aoAlternar, comCaixa = true }: DobraProps) {
  const controlada = aberta !== undefined;

  return (
    <details
      className={estilos.dobra}
      {...(controlada ? { open: aberta } : {})}
      {...(aoAlternar ? { onToggle: (evento) => aoAlternar(evento.currentTarget.open) } : {})}
    >
      <summary className={destaque ? `${estilos.gatilho} ${estilos.destaque}` : estilos.gatilho}>{rotulo}</summary>
      <div className={comCaixa ? estilos.corpo : estilos.corpoSemCaixa}>{children}</div>
    </details>
  );
}
