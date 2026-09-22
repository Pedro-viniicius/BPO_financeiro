"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import estilos from "./barra-inferior.module.css";
import { estaDisponivel, rotaAtiva, type ItemDeMenu } from "./mapa-navegacao";

export interface BarraInferiorProps {
  /** Ate quatro destinos; a doc de responsividade fixa: Início, Pagar, Receber, Mais. */
  readonly itens: readonly ItemDeMenu[];
  /** Chamado pelo item "Mais" para abrir o painel deslizante com a navegacao completa. */
  readonly aoAbrirMais: () => void;
}

/**
 * Barra fixa no rodape, apenas em celular (< 768px). No desktop nao e
 * renderizada pelo CSS. Ver docs/ux/responsividade.md, secao 3.
 */
export function BarraInferior({ itens, aoAbrirMais }: BarraInferiorProps) {
  // A barra inferior tem 4 lugares no celular: gastar um com modulo que nao
  // abre seria desperdicio. Os futuros ficam so no painel completo.
  itens = itens.filter(estaDisponivel);
  const rotaAtual = usePathname() ?? "/";

  return (
    <nav className={estilos.barra} aria-label="Navegação rápida">
      <ul className={estilos.lista}>
        {itens.slice(0, 3).map((item) => {
          const ativo = rotaAtiva(rotaAtual, item.rota);
          return (
            <li key={item.rota}>
              <Link
                href={item.rota}
                className={`${estilos.item} ${ativo ? estilos.ativo : ""}`}
                {...(ativo ? { "aria-current": "page" as const } : {})}
              >
                {rotuloCurto(item)}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" className={estilos.item} onClick={aoAbrirMais} aria-haspopup="dialog">
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Rotulos curtos so na barra inferior; no painel completo o nome inteiro volta. */
function rotuloCurto(item: ItemDeMenu): string {
  const curtos: Record<string, string> = {
    "/contas-pagar": "Pagar",
    "/contas-receber": "Receber",
  };
  return curtos[item.rota] ?? item.rotulo;
}
