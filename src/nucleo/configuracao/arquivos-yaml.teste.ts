import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Os YAML do repositorio nao podem ter `: ` em escalar sem aspas.
 *
 * Em YAML, dois-pontos seguidos de espaco abrem um mapeamento. Dentro de um
 * valor sem aspas, isso nao da erro na linha: invalida o ARQUIVO INTEIRO, e a
 * ferramenta que o le costuma falhar longe dali, com uma mensagem que nao
 * ajuda.
 *
 * Aconteceu duas vezes neste projeto:
 *
 *   ci.yml    - name: Aplicar migracoes de novo (deve ser idempotente: nada
 *               pendente)   -> 13 execucoes de CI vermelhas, zero jobs, desde
 *               o primeiro commit. Ninguem percebeu porque o GitHub so diz
 *               "workflow file issue".
 *   compose   DOMINIO: ${DOMINIO:?defina DOMINIO (ex.: financeiro.exemplo)}
 *
 * A checagem e proposital e deliberadamente simples: procura a armadilha, nao
 * valida YAML. Validar exigiria uma dependencia nova so para isto, e o erro
 * que custa caro aqui e sempre o mesmo.
 */

const PASTAS = [".github", "scripts"];
const ARQUIVOS_NA_RAIZ = ["docker-compose.yml", "docker-compose.producao.yml"];

function arquivosYaml(pasta: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(pasta);
  } catch {
    return [];
  }
  return entradas.flatMap((entrada) => {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) return arquivosYaml(caminho);
    return caminho.endsWith(".yml") || caminho.endsWith(".yaml") ? [caminho] : [];
  });
}

/**
 * Linhas `chave: valor` cujo valor comeca sem aspas e contem `: `.
 *
 * Ignora comentarios, itens de lista que sao so `- chave: valor` aninhado e
 * valores que ja comecam com aspas — nesses o `: ` e inofensivo.
 */
function linhasPerigosas(conteudo: string): string[] {
  const achados: string[] = [];
  conteudo.split("\n").forEach((linha, indice) => {
    const semComentario = linha.replace(/\s+#.*$/, "");
    const casamento = /^\s*(?:-\s+)?[A-Za-z_][\w.-]*:\s+(.*)$/.exec(semComentario);
    if (!casamento) return;
    const valor = casamento[1]!.trim();
    if (!valor || valor.startsWith('"') || valor.startsWith("'") || valor.startsWith("|") || valor.startsWith(">")) return;
    // `{ a: 1, b: 2 }` e `[a, b]` sao sintaxe de fluxo, nao escalar solto.
    if (valor.startsWith("{") || valor.startsWith("[")) return;
    if (/:\s/.test(valor)) achados.push(`${indice + 1}: ${linha.trim()}`);
  });
  return achados;
}

describe("arquivos YAML do repositorio", () => {
  const arquivos = [...PASTAS.flatMap(arquivosYaml), ...ARQUIVOS_NA_RAIZ];

  it("encontra os arquivos que deveria conferir", () => {
    expect(arquivos).toContain(".github/workflows/ci.yml");
    expect(arquivos).toContain("docker-compose.producao.yml");
  });

  it.each(arquivos)("%s nao tem ': ' em valor sem aspas", (caminho) => {
    let conteudo: string;
    try {
      conteudo = readFileSync(caminho, "utf-8");
    } catch {
      return; // arquivo opcional que nao existe nesta copia
    }
    expect(
      linhasPerigosas(conteudo),
      `${caminho}: dois-pontos seguidos de espaco em valor sem aspas invalidam o arquivo inteiro. Ponha aspas no valor.`,
    ).toEqual([]);
  });
});
