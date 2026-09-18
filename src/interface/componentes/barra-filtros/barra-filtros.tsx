"use client";

import type { ReactNode } from "react";

import { Botao } from "../botao/botao";

import estilos from "./barra-filtros.module.css";

export interface FichaDeFiltro {
  readonly chave: string;
  /** Texto legivel do filtro aplicado ("Fornecedor: Moinho Real"). */
  readonly rotulo: string;
}

export interface BarraFiltrosProps {
  readonly rotuloDaBusca: string;
  readonly textoBuscado: string;
  readonly aoBuscar: (texto: string) => void;
  /** Controles de filtro (periodo, fornecedor, categoria...). */
  readonly children?: ReactNode;
  /** Filtros aplicados, cada um removivel. Tornam visivel o que a lista esta escondendo. */
  readonly fichas?: readonly FichaDeFiltro[];
  readonly aoRemoverFicha?: (chave: string) => void;
  readonly aoLimparTudo?: () => void;
}

/**
 * Barra de busca e filtros das listagens.
 *
 * Os filtros aplicados aparecem sempre como fichas removiveis: uma lista que
 * esconde linhas sem dizer por que e a principal fonte de "sumiu um lancamento".
 */
export function BarraFiltros({
  rotuloDaBusca,
  textoBuscado,
  aoBuscar,
  children,
  fichas = [],
  aoRemoverFicha,
  aoLimparTudo,
}: BarraFiltrosProps) {
  return (
    <div className={estilos.barra}>
      <div className={estilos.controles}>
        <div className={estilos.busca}>
          <label className={estilos.rotuloBusca} htmlFor="campo-busca-lista">
            {rotuloDaBusca}
          </label>
          <input
            id="campo-busca-lista"
            type="search"
            className={estilos.campo}
            value={textoBuscado}
            placeholder="Nome, documento ou código"
            onChange={(evento) => aoBuscar(evento.target.value)}
          />
        </div>
        {children}
      </div>

      {fichas.length > 0 ? (
        <div className={estilos.fichas}>
          <span className={estilos.rotuloFichas}>Filtros ativos:</span>
          {fichas.map((ficha) => (
            <span key={ficha.chave} className={estilos.ficha}>
              {ficha.rotulo}
              {aoRemoverFicha ? (
                <button
                  type="button"
                  className={estilos.remover}
                  onClick={() => aoRemoverFicha(ficha.chave)}
                  aria-label={`Remover filtro ${ficha.rotulo}`}
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          {aoLimparTudo ? (
            <Botao variante="discreto" tamanho="pequeno" onClick={aoLimparTudo}>
              Limpar filtros
            </Botao>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
