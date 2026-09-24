import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOMES_SITUACAO_PAGAR, NOMES_SITUACAO_RECEBER, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";

/**
 * Cada area fala a propria lingua.
 *
 * Contas a pagar e contas a receber sao quase simetricas — e por isso e facil
 * copiar uma e esquecer de traduzir. O resultado nao quebra nada: a tela de
 * contas a receber simplesmente passa a dizer "Paga" e "Ja pago" para uma
 * mensalidade recebida. Ninguem ve erro; so ve uma tela que fala errado, e a
 * confianca no sistema cai sem que se saiba por que.
 *
 * Esta varredura le os arquivos de cada area e falha quando o vocabulario da
 * outra aparece.
 */

const PASTA_APLICACAO = "src/app/(aplicacao)";

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((entrada) => {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return caminho.endsWith(".tsx") || caminho.endsWith(".ts") ? [caminho] : [];
  });
}

function arquivosDaArea(area: string): { caminho: string; conteudo: string }[] {
  return arquivosDe(join(PASTA_APLICACAO, area))
    .filter((caminho) => !caminho.includes(".teste."))
    .map((caminho) => ({ caminho, conteudo: readFileSync(caminho, "utf-8") }));
}

/** Palavras da outra area que nunca devem aparecer. Ignora o que e nome tecnico. */
function ocorrencias(conteudo: string, proibidas: readonly RegExp[]): string[] {
  return proibidas.flatMap((padrao) => [...conteudo.matchAll(padrao)].map((achado) => achado[0]));
}

describe("vocabulario das telas", () => {
  it("contas a receber nao usa os nomes de situacao de contas a pagar", () => {
    const erradas = arquivosDaArea("contas-receber")
      .filter(({ conteudo }) => conteudo.includes("NOMES_SITUACAO_PAGAR"))
      .map(({ caminho }) => caminho);
    expect(erradas, "A tela de contas a receber mostraria 'Paga' para uma conta recebida.").toEqual([]);
  });

  it("contas a pagar nao usa os nomes de situacao de contas a receber", () => {
    const erradas = arquivosDaArea("contas-pagar")
      .filter(({ conteudo }) => conteudo.includes("NOMES_SITUACAO_RECEBER"))
      .map(({ caminho }) => caminho);
    expect(erradas).toEqual([]);
  });

  it("as telas de contas a receber nao falam de pagar nem de fornecedor", () => {
    // `formaPagamento` e `FORMAS_DE_PAGAMENTO` sao nomes do modelo: a forma de
    // pagamento existe nos dois lados. O resto e vocabulario de tela.
    // "clientees" e "conta a pagar" entraram por copia com troca automatica
    // de palavra: a tela de nova conta a RECEBER se chamava "Nova conta a pagar".
    const proibidas = [
      /\bJá pago\b/g,
      /\bfornecedor(es)?\b/gi,
      /\bpagamento registrado\b/gi,
      /\bcontas? a pagar\b/gi,
      /\bgastando\b/gi,
      /\bclientees\b/gi,
    ];
    const encontradas = arquivosDaArea("contas-receber").flatMap(({ caminho, conteudo }) => {
      const limpo = conteudo.replace(/formaPagamento|FORMAS_DE_PAGAMENTO|NOMES_FORMA_PAGAMENTO|forma_pagamento|formas-de-pagamento/g, "");
      return ocorrencias(limpo, proibidas).map((palavra) => `${caminho} -> ${palavra}`);
    });
    expect(encontradas, "Vocabulario de contas a pagar vazou para contas a receber.").toEqual([]);
  });

  it("as telas de contas a pagar nao falam de receber nem de cliente", () => {
    const proibidas = [/\bJá recebido\b/g, /\bclientes?\b/gi, /\brecebimento registrado\b/gi, /\bcontas? a receber\b/gi, /\bde onde vem a receita\b/gi];
    const encontradas = arquivosDaArea("contas-pagar").flatMap(({ caminho, conteudo }) =>
      ocorrencias(conteudo, proibidas).map((palavra) => `${caminho} -> ${palavra}`),
    );
    expect(encontradas, "Vocabulario de contas a receber vazou para contas a pagar.").toEqual([]);
  });

  it("os dois dicionarios cobrem todas as situacoes e sao de fato diferentes", () => {
    const situacoes: SituacaoDerivada[] = ["aberta", "parcial", "vencida", "liquidada", "cancelada"];
    for (const situacao of situacoes) {
      expect(NOMES_SITUACAO_PAGAR[situacao]).toBeTruthy();
      expect(NOMES_SITUACAO_RECEBER[situacao]).toBeTruthy();
    }
    expect(NOMES_SITUACAO_PAGAR.liquidada).toBe("Paga");
    expect(NOMES_SITUACAO_RECEBER.liquidada).toBe("Recebida");
    expect(NOMES_SITUACAO_PAGAR.parcial).not.toBe(NOMES_SITUACAO_RECEBER.parcial);
  });
  /**
   * Id de PAPEL onde se espera id de PESSOA.
   *
   * `listarFornecedores` e `listarClientes` devolvem o id do papel (a linha em
   * `fornecedores`/`clientes`), que e o que um TITULO referencia. Quem guarda
   * `pessoa_id` — a divida guarda o credor assim — precisa de
   * `listarPessoas`. Os dois sao uuid e os dois preenchem um <select> igual,
   * entao trocar um pelo outro compila, passa no tipo e so falha na hora de
   * gravar, com "credor nao encontrado". Foi exatamente o que aconteceu na
   * verificacao manual do Gate 8.
   */
  it("telas que guardam pessoa usam listarPessoas, nao a lista de papeis", () => {
    const erros = arquivosDe(PASTA_APLICACAO)
      .filter((caminho) => !caminho.includes(".teste."))
      .flatMap((caminho) => {
        const conteudo = readFileSync(caminho, "utf-8");
        const guardaPessoa = /\bcredorPessoaId\b|\bpessoaId:\s*\w+\.id\b/.test(conteudo);
        const usaPapel = /listarFornecedores|listarClientes/.test(conteudo);
        return guardaPessoa && usaPapel ? [`${caminho}: guarda pessoa mas le a lista de papeis`] : [];
      });
    expect(erros, "Id de papel usado onde o modelo espera id de pessoa.").toEqual([]);
  });
});
