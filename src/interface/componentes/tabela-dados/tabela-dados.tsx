"use client";

import type { ReactNode } from "react";

import { Esqueleto } from "../esqueleto/esqueleto";

import estilos from "./tabela-dados.module.css";

export type AlinhamentoColuna = "esquerda" | "direita";

export interface ColunaTabela<T> {
  /** Identificador estavel da coluna; tambem usado na ordenacao e na URL. */
  readonly chave: string;
  readonly titulo: string;
  /** Dinheiro e quantidade alinham a direita; o resto, a esquerda. */
  readonly alinhamento?: AlinhamentoColuna;
  readonly largura?: string;
  /** Quando falso, o cabecalho nao e clicavel. Padrao: falso. */
  readonly ordenavel?: boolean;
  readonly celula: (linha: T) => ReactNode;
}

export interface OrdenacaoTabela {
  readonly chave: string;
  readonly direcao: "crescente" | "decrescente";
}

export interface TabelaDadosProps<T> {
  /** Resumo da tabela para leitores de tela. Obrigatorio. */
  readonly legenda: string;
  readonly colunas: readonly ColunaTabela<T>[];
  readonly linhas: readonly T[];
  readonly chaveDaLinha: (linha: T) => string;
  readonly ordenacao?: OrdenacaoTabela;
  readonly aoOrdenar?: (chave: string) => void;
  /** Clicar na linha (fora dos controles) abre o detalhe. */
  readonly aoAbrirLinha?: (linha: T) => void;
  readonly carregando?: boolean;
  /** Mostrado no lugar do corpo quando nao ha linhas. */
  readonly estadoVazio?: ReactNode;
  /** Totais da tabela; aparece no rodape (<tfoot>), nao como mais uma linha. */
  readonly rodape?: ReactNode;
}

/**
 * Tabela padrao de dados financeiros.
 *
 * Garantias de acessibilidade: <caption> descritivo, <th scope="col">,
 * `aria-sort` na coluna ordenada e ordenacao acionavel por teclado.
 * Ver docs/ux/tabelas-e-listagens.md.
 */
export function TabelaDados<T>({
  legenda,
  colunas,
  linhas,
  chaveDaLinha,
  ordenacao,
  aoOrdenar,
  aoAbrirLinha,
  carregando = false,
  estadoVazio,
  rodape,
}: TabelaDadosProps<T>) {
  if (carregando) {
    return <Esqueleto linhas={8} altura="36px" descricao={`Carregando ${legenda.toLowerCase()}`} />;
  }

  if (linhas.length === 0 && estadoVazio) {
    return <>{estadoVazio}</>;
  }

  return (
    <div className={estilos.moldura}>
      <table className={estilos.tabela}>
        <caption className="apenas-leitor-de-tela">{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((coluna) => {
              const ordenada = ordenacao?.chave === coluna.chave;
              const direcao = ordenada
                ? ordenacao.direcao === "crescente"
                  ? "ascending"
                  : "descending"
                : "none";
              return (
                <th
                  key={coluna.chave}
                  scope="col"
                  className={coluna.alinhamento === "direita" ? estilos.direita : undefined}
                  {...(coluna.largura !== undefined ? { style: { width: coluna.largura } } : {})}
                  {...(coluna.ordenavel === true ? { "aria-sort": direcao } : {})}
                >
                  {coluna.ordenavel === true && aoOrdenar ? (
                    <button type="button" className={estilos.botaoOrdenar} onClick={() => aoOrdenar(coluna.chave)}>
                      {coluna.titulo}
                      <span aria-hidden="true">{ordenada ? (direcao === "ascending" ? " ↑" : " ↓") : ""}</span>
                    </button>
                  ) : (
                    coluna.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr
              key={chaveDaLinha(linha)}
              className={aoAbrirLinha ? estilos.linhaClicavel : undefined}
              {...(aoAbrirLinha ? { onClick: () => aoAbrirLinha(linha) } : {})}
            >
              {colunas.map((coluna) => (
                <td key={coluna.chave} className={coluna.alinhamento === "direita" ? estilos.direita : undefined}>
                  {coluna.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape ? <tfoot>{rodape}</tfoot> : null}
      </table>
    </div>
  );
}
