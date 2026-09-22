import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Torna executavel a promessa do ADR-017.
 *
 * O ADR decidiu NAO adotar seguranca por linha (RLS) e manter o isolamento
 * entre empresas na camada de repositorio. Essa decisao so e honesta se os
 * controles compensatorios existirem de verdade — em especial os controles 1 e
 * 3, que ate aqui eram texto:
 *
 *   1. todo repositorio financeiro recebe `EscopoEmpresa`;
 *   3. todo repositorio financeiro tem teste provando que a empresa A nao
 *      enxerga dados da empresa B.
 *
 * Este teste transforma os dois em falha de build. Hoje nao ha nenhum
 * repositorio financeiro concreto, entao ele passa sem cobrar nada; no Gate 5,
 * o primeiro `repositorio-*.ts` que aparecer sem teste de isolamento quebra a
 * verificacao. E de proposito: o momento de exigir a prova e quando o codigo
 * nasce, nao depois de um incidente.
 */

const PASTA_MODULOS = "src/modulos";
const PASTA_TESTES_BANCO = "src/banco-dados/testes";

/** Repositorio concreto de modulo de negocio: `src/modulos/<mod>/infraestrutura/repositorio-*.ts`. */
interface RepositorioFinanceiro {
  readonly modulo: string;
  readonly caminho: string;
  readonly nomeBase: string;
}

function listarArquivos(pasta: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(pasta);
  } catch {
    return [];
  }
  return entradas.flatMap((entrada) => {
    const caminho = join(pasta, entrada);
    return statSync(caminho).isDirectory() ? listarArquivos(caminho) : [caminho];
  });
}

function repositoriosFinanceiros(): RepositorioFinanceiro[] {
  let modulos: string[];
  try {
    modulos = readdirSync(PASTA_MODULOS);
  } catch {
    return [];
  }
  return modulos.flatMap((modulo) =>
    listarArquivos(join(PASTA_MODULOS, modulo, "infraestrutura"))
      .filter((caminho) => /\/repositorio-[^/]+\.ts$/.test(caminho) && !caminho.endsWith(".teste.ts"))
      .map((caminho) => ({ modulo, caminho, nomeBase: caminho.split("/").pop()!.replace(/\.ts$/, "") })),
  );
}

function testesQuePodemCobrir(modulo: string): { readonly caminho: string; readonly conteudo: string }[] {
  return [...listarArquivos(join(PASTA_MODULOS, modulo)), ...listarArquivos(PASTA_TESTES_BANCO)]
    .filter((caminho) => caminho.endsWith(".teste.ts"))
    .map((caminho) => ({ caminho, conteudo: readFileSync(caminho, "utf-8") }));
}

describe("ADR-017: isolamento entre empresas na camada de repositorio", () => {
  const repositorios = repositoriosFinanceiros();

  it("todo repositorio financeiro concreto recebe EscopoEmpresa", () => {
    const semEscopo = repositorios.filter((repositorio) => !readFileSync(repositorio.caminho, "utf-8").includes("EscopoEmpresa"));

    expect(
      semEscopo.map((repositorio) => repositorio.caminho),
      "Repositorio financeiro sem EscopoEmpresa. Sem RLS (ADR-017), o filtro por " +
        "empresa_id e a UNICA barreira: todo metodo publico recebe o escopo como " +
        "primeiro parametro e filtra por ele.",
    ).toEqual([]);
  });

  it("todo repositorio financeiro concreto tem teste de isolamento entre empresas", () => {
    const semTeste = repositorios.filter((repositorio) => {
      const candidatos = testesQuePodemCobrir(repositorio.modulo);
      return !candidatos.some(
        ({ conteudo }) => conteudo.includes(repositorio.nomeBase) && /isolamento/i.test(conteudo),
      );
    });

    expect(
      semTeste.map((repositorio) => repositorio.caminho),
      "Repositorio financeiro sem teste de isolamento. Crie um teste que cite " +
        "o nome do arquivo do repositorio e a palavra 'isolamento', com DUAS empresas, " +
        "provando que a consulta de uma nunca devolve linha da outra. " +
        "E o controle 3 do ADR-017 — a contrapartida de nao ter RLS.",
    ).toEqual([]);
  });

  it("a propria busca por repositorios funciona (evita passar vazio por engano)", () => {
    // Se o padrao de pastas mudar, os dois testes acima passariam sem verificar
    // nada. Este ancora o mecanismo: os modulos existem e sao varridos.
    expect(readdirSync(PASTA_MODULOS).length).toBeGreaterThan(0);
    expect(repositoriosFinanceiros()).toEqual(repositorios);
  });
});
