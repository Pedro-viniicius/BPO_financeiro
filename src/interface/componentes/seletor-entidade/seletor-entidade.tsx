"use client";

import { useId, useMemo, useState } from "react";

import estilos from "./seletor-entidade.module.css";

export interface OpcaoEntidade {
  readonly id: string;
  /** Nome como o usuario o conhece. */
  readonly rotulo: string;
  /** Dado que desambigua homonimos: documento, cidade, apelido. */
  readonly complemento?: string;
}

export interface SeletorEntidadeProps {
  readonly id: string;
  /** "Fornecedor", "Cliente", "Categoria". Usado no texto de criacao inline. */
  readonly tipo: string;
  readonly opcoes: readonly OpcaoEntidade[];
  readonly selecionado?: OpcaoEntidade;
  readonly aoSelecionar: (opcao: OpcaoEntidade) => void;
  /**
   * Quando informado, a ultima opcao da lista e `+ Criar "<texto digitado>"`.
   * Sem criacao inline, o operador abandona o lancamento para ir ao cadastro.
   */
  readonly aoCriar?: (nome: string) => void;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-invalid"?: boolean | undefined;
  readonly required?: boolean;
}

/**
 * Selecao de fornecedor, cliente, categoria ou conta, com busca e criacao
 * inline (docs/ux/formularios.md, secao 6).
 *
 * Teclado: setas navegam, Enter seleciona, Esc fecha.
 * A busca ignora acento e pontuacao — "sao jorge" encontra "São Jorge" e
 "12.345.678/0001-95" encontra "12345678000195".
 */
export function SeletorEntidade({
  id,
  tipo,
  opcoes,
  selecionado,
  aoSelecionar,
  aoCriar,
  required = false,
  ...acessibilidade
}: SeletorEntidadeProps) {
  const [texto, definirTexto] = useState(selecionado?.rotulo ?? "");
  const [aberto, definirAberto] = useState(false);
  const [indiceAtivo, definirIndiceAtivo] = useState(0);
  const idLista = useId();

  const filtradas = useMemo(() => {
    const busca = normalizar(texto);
    if (busca === "") return opcoes.slice(0, 20);
    return opcoes
      .filter((opcao) => normalizar(`${opcao.rotulo} ${opcao.complemento ?? ""}`).includes(busca))
      .slice(0, 20);
  }, [opcoes, texto]);

  const podeCriar = aoCriar !== undefined && texto.trim() !== "" && filtradas.length === 0;
  const totalItens = filtradas.length + (podeCriar ? 1 : 0);

  function escolher(indice: number) {
    if (podeCriar && indice === filtradas.length) {
      aoCriar?.(texto.trim());
      definirAberto(false);
      return;
    }
    const opcao = filtradas[indice];
    if (!opcao) return;
    aoSelecionar(opcao);
    definirTexto(opcao.rotulo);
    definirAberto(false);
  }

  return (
    <div className={estilos.moldura}>
      <input
        {...acessibilidade}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        className={estilos.campo}
        value={texto}
        required={required}
        placeholder={`Buscar ${tipo.toLowerCase()}`}
        onChange={(evento) => {
          definirTexto(evento.target.value);
          definirAberto(true);
          definirIndiceAtivo(0);
        }}
        onFocus={() => definirAberto(true)}
        onKeyDown={(evento) => {
          if (evento.key === "ArrowDown") {
            evento.preventDefault();
            definirAberto(true);
            definirIndiceAtivo((atual) => (totalItens === 0 ? 0 : (atual + 1) % totalItens));
          } else if (evento.key === "ArrowUp") {
            evento.preventDefault();
            definirIndiceAtivo((atual) => (totalItens === 0 ? 0 : (atual - 1 + totalItens) % totalItens));
          } else if (evento.key === "Enter" && aberto) {
            evento.preventDefault();
            escolher(indiceAtivo);
          } else if (evento.key === "Escape") {
            definirAberto(false);
          }
        }}
      />

      {aberto ? (
        <ul className={estilos.lista} id={idLista} role="listbox" aria-label={tipo}>
          {filtradas.map((opcao, indice) => (
            <li
              key={opcao.id}
              role="option"
              aria-selected={indice === indiceAtivo}
              className={`${estilos.opcao} ${indice === indiceAtivo ? estilos.ativa : ""}`}
              onMouseDown={(evento) => {
                evento.preventDefault();
                escolher(indice);
              }}
            >
              <span>{opcao.rotulo}</span>
              {opcao.complemento ? <span className={estilos.complemento}>{opcao.complemento}</span> : null}
            </li>
          ))}

          {podeCriar ? (
            <li
              role="option"
              aria-selected={indiceAtivo === filtradas.length}
              className={`${estilos.opcao} ${estilos.criar} ${indiceAtivo === filtradas.length ? estilos.ativa : ""}`}
              onMouseDown={(evento) => {
                evento.preventDefault();
                escolher(filtradas.length);
              }}
            >
              + Criar {tipo.toLowerCase()} &ldquo;{texto.trim()}&rdquo;
            </li>
          ) : null}

          {filtradas.length === 0 && !podeCriar ? (
            <li className={estilos.semResultado}>Nenhum resultado para &ldquo;{texto}&rdquo;.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Remove acento, pontuacao e caixa para que a busca funcione como o usuario espera. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9a-zA-Z ]/g, "")
    .toLowerCase()
    .trim();
}
