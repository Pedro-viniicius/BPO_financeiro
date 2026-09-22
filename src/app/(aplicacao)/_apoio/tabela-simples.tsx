"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { SeloSituacao, TabelaDados, type TomSemantico } from "@/interface/componentes/indice";

/**
 * Ponte entre paginas de servidor e `TabelaDados`, que e componente de cliente.
 *
 * `TabelaDados` recebe `celula: (linha) => ReactNode` — uma FUNCAO. Funcoes nao
 * atravessam a fronteira servidor -> cliente: o React recusa a serializacao e a
 * pagina quebra assim que houver uma linha (com a tabela vazia o erro nem
 * aparece, o que o torna especialmente traicoeiro).
 *
 * Entao a pagina de servidor manda apenas DADOS — textos, rotas, tons — e as
 * funcoes nascem aqui, ja do lado do cliente.
 */

export type CelulaSimples =
  | string
  | { readonly tipo: "link"; readonly texto: string; readonly rota: string }
  | { readonly tipo: "selo"; readonly rotulo: string; readonly tom: TomSemantico }
  | { readonly tipo: "selos"; readonly selos: readonly { readonly rotulo: string; readonly tom: TomSemantico }[] };

export interface ColunaSimples {
  readonly chave: string;
  readonly titulo: string;
  readonly alinhamento?: "esquerda" | "direita";
}

export interface LinhaSimples {
  readonly chave: string;
  readonly celulas: Readonly<Record<string, CelulaSimples>>;
}

function desenhar(celula: CelulaSimples | undefined): ReactNode {
  if (celula === undefined) return "—";
  if (typeof celula === "string") return celula;
  if (celula.tipo === "link") return <Link href={celula.rota}>{celula.texto}</Link>;
  if (celula.tipo === "selo") return <SeloSituacao tom={celula.tom} rotulo={celula.rotulo} />;
  return (
    <>
      {celula.selos.map((s) => (
        <SeloSituacao key={s.rotulo} tom={s.tom} rotulo={s.rotulo} />
      ))}
    </>
  );
}

export function TabelaSimples({
  legenda,
  colunas,
  linhas,
}: {
  readonly legenda: string;
  readonly colunas: readonly ColunaSimples[];
  readonly linhas: readonly LinhaSimples[];
}) {
  return (
    <TabelaDados
      legenda={legenda}
      colunas={colunas.map((coluna) => ({
        chave: coluna.chave,
        titulo: coluna.titulo,
        ...(coluna.alinhamento ? { alinhamento: coluna.alinhamento } : {}),
        celula: (linha: LinhaSimples) => desenhar(linha.celulas[coluna.chave]),
      }))}
      linhas={linhas}
      chaveDaLinha={(linha) => linha.chave}
    />
  );
}
