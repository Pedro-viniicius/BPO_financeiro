import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Contas a pagar e contas a receber sao SIMETRICAS, e precisam continuar sendo.
 *
 * Os dois repositorios sao 96% iguais depois de trocar o vocabulario: mesmas
 * operacoes, mesmas regras, mesma ordem. O que difere e encanamento — a tabela
 * se chama `fornecedores` de um lado e `clientes` do outro.
 *
 * POR QUE NAO FORAM UNIFICADOS. A regra de dinheiro JA e compartilhada: os
 * dois importam `abatimentoDaBaixa`, `saldoEmAberto`, `situacaoDerivada` e as
 * demais de `compartilhado/financeiro`. O que sobra e a camada que fala com o
 * banco, e uni-la exigiria montar nomes de tabela como texto (`sql.raw`), o
 * que apagaria a conferencia de tipos justamente onde se mexe em dinheiro.
 * Trocar seguranca de tipo por menos linhas e mau negocio aqui.
 *
 * O RISCO REAL da duplicacao nao e o tamanho: e alguem corrigir um lado e
 * esquecer o outro. Ja aconteceu neste projeto, no Gate 5.1, quando contas a
 * receber nasceu de uma copia de contas a pagar. Este teste guarda exatamente
 * isso — se um ganhar uma operacao ou uma regra compartilhada que o outro nao
 * tem, ele reprova e diz qual.
 */

const PAGAR = "src/modulos/contas-pagar/infraestrutura/repositorio-contas-pagar-drizzle.ts";
const RECEBER = "src/modulos/contas-receber/infraestrutura/repositorio-contas-receber-drizzle.ts";

/** Troca o vocabulario de cada lado por um termo neutro, para poder comparar. */
function normalizar(texto: string): string {
  return texto
    .replace(/[Pp]agamentos?/g, "BAIXA")
    .replace(/[Rr]ecebimentos?/g, "BAIXA")
    .replace(/[Pp]agar/g, "TITULO")
    .replace(/[Rr]eceber/g, "TITULO")
    .replace(/[Ff]ornecedor(es)?/g, "PESSOA")
    .replace(/[Cc]lientes?/g, "PESSOA");
}

/** Nomes dos metodos publicos, ja neutros. */
function operacoes(arquivo: string): string[] {
  const conteudo = normalizar(readFileSync(arquivo, "utf-8"));
  return [...conteudo.matchAll(/^ {2}(?:async )?([a-z][a-zA-Z]*)\(/gm)]
    .map((achado) => achado[1]!)
    .filter((nome) => nome !== "constructor")
    .sort();
}

/** Funcoes de regra que o repositorio importa de `compartilhado/financeiro`. */
function regrasImportadas(arquivo: string): string[] {
  const conteudo = readFileSync(arquivo, "utf-8");
  const bloco = /import \{([^}]+)\} from "@\/compartilhado\/financeiro\/indice";/.exec(conteudo);
  if (!bloco) return [];
  return bloco[1]!
    .split(",")
    .map((nome) => nome.replace(/\btype\b/, "").trim())
    .filter(Boolean)
    .sort();
}

describe("simetria entre contas a pagar e contas a receber", () => {
  it("os dois oferecem as MESMAS operacoes", () => {
    const naPagar = operacoes(PAGAR);
    const naReceber = operacoes(RECEBER);

    const soEmPagar = naPagar.filter((nome) => !naReceber.includes(nome));
    const soEmReceber = naReceber.filter((nome) => !naPagar.includes(nome));

    expect(
      { soEmPagar, soEmReceber },
      "Uma operação existe em um lado e não no outro. Se foi de propósito, explique aqui; " +
        "quase sempre é uma correção aplicada só num deles.",
    ).toEqual({ soEmPagar: [], soEmReceber: [] });
  });

  it("os dois usam as MESMAS regras compartilhadas de dinheiro", () => {
    // Se um passar a usar `abatimentoDaBaixa` e o outro nao, os dois lados
    // calculam o abatimento de jeitos diferentes — e ninguem percebe ate os
    // relatorios discordarem.
    expect(regrasImportadas(PAGAR)).toEqual(regrasImportadas(RECEBER));
  });

  it("continuam praticamente iguais depois de trocar o vocabulario", () => {
    const linhasPagar = normalizar(readFileSync(PAGAR, "utf-8")).split("\n");
    const linhasReceber = new Set(normalizar(readFileSync(RECEBER, "utf-8")).split("\n"));

    const soEmPagar = linhasPagar.filter((linha) => linha.trim() && !linhasReceber.has(linha));
    const proporcao = soEmPagar.length / linhasPagar.length;

    /*
     * Ate 15% de diferenca e o encanamento legitimo (nomes de tabela, ordem de
     * import). Acima disso, os dois comecaram a divergir de verdade — e a
     * pergunta passa a ser se a diferenca foi intencional.
     */
    expect(
      proporcao,
      `Os dois repositórios divergiram em ${(proporcao * 100).toFixed(0)}% das linhas. ` +
        "Confira se uma correção foi aplicada em apenas um deles.",
    ).toBeLessThan(0.15);
  });
});
