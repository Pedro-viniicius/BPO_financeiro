import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ehPermissaoConhecida } from "@/nucleo/autorizacao/publico";

/**
 * A autorizacao das telas financeiras, verificada contra o disco.
 *
 * Tres coisas quebram silenciosamente num sistema como este:
 *
 * 1. Uma pagina nova esquecida sem guarda. Ela funciona perfeitamente em todos
 *    os testes manuais — feitos com um usuario que tem tudo — e so aparece
 *    quando alguem sem permissao chega nela.
 * 2. Uma acao de servidor nova sem guarda. Pior que a pagina: a acao MUDA
 *    dados, e um POST direto nao passa por tela nenhuma.
 * 3. Uma permissao com o nome errado. `permissoes.has("contas_receber.receber")`
 *    nao estoura em lugar nenhum — apenas devolve `false` para sempre, e o
 *    recurso fica invisivel sem que ninguem entenda por que.
 *
 * Esta varredura le os arquivos e falha nos tres casos. Ela nao substitui os
 * testes de `guarda-acesso`, que provam o COMPORTAMENTO da guarda; ela prova
 * que a guarda esta em todos os lugares onde precisa estar.
 */

const PASTA_APLICACAO = "src/app/(aplicacao)";

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((entrada) => {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return caminho.endsWith(".ts") || caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

const ARQUIVOS = arquivosDe(PASTA_APLICACAO)
  .filter((caminho) => !caminho.endsWith(".teste.ts") && !caminho.endsWith(".teste.tsx"))
  .map((caminho) => ({ caminho, conteudo: readFileSync(caminho, "utf-8") }));

const TEM_GUARDA = /exigirContextoFinanceiro\(|exigirAcesso\(/;

/** Toda permissao citada em qualquer lugar do codigo das telas. */
function permissoesCitadas(conteudo: string): string[] {
  const citacoes = [
    ...conteudo.matchAll(/exigirContextoFinanceiro\(\s*"([^"]+)"/g),
    ...conteudo.matchAll(/exigirAcesso\(\s*"([^"]+)"/g),
    ...conteudo.matchAll(/permissoes\.has\(\s*"([^"]+)"/g),
  ];
  return citacoes.map((achado) => achado[1]!);
}

describe("autorizacao das telas", () => {
  it("a varredura realmente encontrou as telas (nao passa vazia por engano)", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(15);
    expect(ARQUIVOS.some(({ caminho }) => caminho.endsWith("contas-pagar/page.tsx"))).toBe(true);
  });

  it("toda pagina exige acesso antes de ler qualquer coisa", () => {
    const desprotegidas = ARQUIVOS.filter(({ caminho }) => caminho.endsWith("page.tsx"))
      .filter(({ conteudo }) => !TEM_GUARDA.test(conteudo))
      .map(({ caminho }) => caminho);

    expect(
      desprotegidas,
      "Pagina sem `exigirContextoFinanceiro`/`exigirAcesso`: qualquer sessao ativa a abriria, " +
        "independentemente do perfil. Esconder o item do menu nao e controle de acesso.",
    ).toEqual([]);
  });

  /*
   * Sair da sessao e a unica acao sem permissao, de proposito: ela ENCERRA o
   * acesso em vez de usa-lo, e tem de funcionar inclusive para quem perdeu o
   * vinculo com a empresa ou esta com a sessao expirando. Exigir permissao
   * aqui prenderia a pessoa dentro do sistema.
   */
  const ACOES_SEM_PERMISSAO = ["acaoSair"];

  it("toda acao de servidor exige acesso", () => {
    const acoesSemGuarda = ARQUIVOS.filter(({ conteudo }) => conteudo.startsWith('"use server"'))
      .flatMap(({ caminho, conteudo }) => {
        // Cada `export async function acao...` precisa de uma guarda dentro.
        const blocos = conteudo.split(/\nexport async function /).slice(1);
        return blocos
          .map((bloco) => ({ bloco, nome: bloco.slice(0, bloco.indexOf("(")) }))
          .filter(({ bloco, nome }) => !TEM_GUARDA.test(bloco) && !ACOES_SEM_PERMISSAO.includes(nome))
          .map(({ nome }) => `${caminho} -> ${nome}`);
      });

    expect(
      acoesSemGuarda,
      "Acao de servidor sem guarda. Uma acao muda dados e pode ser chamada por POST direto, " +
        "sem passar por tela nenhuma — a verificacao tem de estar dentro dela.",
    ).toEqual([]);
  });

  it("toda permissao citada existe no catalogo", () => {
    const desconhecidas = ARQUIVOS.flatMap(({ caminho, conteudo }) =>
      permissoesCitadas(conteudo)
        .filter((permissao) => !ehPermissaoConhecida(permissao))
        .map((permissao) => `${caminho} -> ${permissao}`),
    );

    expect(
      desconhecidas,
      "Permissao que nao existe no catalogo. `permissoes.has` com nome errado nao estoura: " +
        "devolve `false` para sempre e o recurso some da tela sem explicacao.",
    ).toEqual([]);
  });

  it("a baixa de contas a receber usa `baixar`, nunca `receber`", () => {
    // A permissao `contas_receber.receber` NAO existe e nunca existiu. O nome
    // correto, desde o Gate 4, e `contas_receber.baixar`.
    const erradas = ARQUIVOS.filter(({ conteudo }) => /"contas_receber\.receber"/.test(conteudo)).map(({ caminho }) => caminho);
    expect(erradas).toEqual([]);

    const acoes = ARQUIVOS.find(({ caminho }) => caminho.endsWith("contas-receber/acoes.ts"));
    expect(acoes?.conteudo).toContain('"contas_receber.baixar"');
  });

  it("cada acao do Gate 5.1 pede a permissao combinada", () => {
    const acoes = (arquivo: string) => ARQUIVOS.find(({ caminho }) => caminho.endsWith(arquivo))?.conteudo ?? "";

    const pagar = acoes("contas-pagar/acoes.ts");
    const receber = acoes("contas-receber/acoes.ts");
    const bancos = acoes("bancos/acoes.ts");

    const permissaoDe = (conteudo: string, acao: string): string | undefined => {
      const bloco = conteudo.slice(conteudo.indexOf(`export async function ${acao}`));
      return /exigirContextoFinanceiro\(\s*"([^"]+)"/.exec(bloco)?.[1];
    };

    expect(permissaoDe(pagar, "acaoEditarContaPagar")).toBe("contas_pagar.editar");
    expect(permissaoDe(pagar, "acaoEstornarPagamento")).toBe("contas_pagar.pagar");
    expect(permissaoDe(pagar, "acaoCancelarContaPagar")).toBe("contas_pagar.cancelar");

    expect(permissaoDe(receber, "acaoEditarContaReceber")).toBe("contas_receber.editar");
    expect(permissaoDe(receber, "acaoEstornarRecebimento")).toBe("contas_receber.baixar");
    expect(permissaoDe(receber, "acaoCancelarContaReceber")).toBe("contas_receber.cancelar");

    expect(permissaoDe(bancos, "acaoEditarContaBancaria")).toBe("bancos.editar");
    expect(permissaoDe(bancos, "acaoAjustarSaldo")).toBe("bancos.editar");
  });

  it("as paginas de edicao exigem a permissao de editar, nao a de visualizar", () => {
    for (const rota of ["contas-pagar/[parcelaId]/editar/page.tsx", "contas-receber/[parcelaId]/editar/page.tsx"]) {
      const pagina = ARQUIVOS.find(({ caminho }) => caminho.endsWith(rota));
      expect(pagina, `Pagina de edicao nao encontrada: ${rota}`).toBeDefined();
      expect(pagina!.conteudo).toMatch(/exigirContextoFinanceiro\(\s*"contas_(pagar|receber)\.editar"/);
    }
  });
});
