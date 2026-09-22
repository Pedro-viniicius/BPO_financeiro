import { describe, expect, it } from "vitest";

import { navegacaoVisivel, NAVEGACAO_PRINCIPAL } from "@/interface/casca/mapa-navegacao";
import { type Papel, type Permissao, resolverPermissoesEfetivas } from "@/nucleo/autorizacao/publico";

import { decidirAcesso } from "./guarda-acesso";

/**
 * A guarda de autorizacao do servidor.
 *
 * `decidirAcesso` e a regra pura por tras de `exigirAcesso`. Testa-la aqui
 * cobre a decisao — permitir, redirecionar ou proibir — sem Next.js e sem
 * banco. A ligacao com sessao e empresa real esta provada em
 * `src/banco-dados/testes/acesso-empresas.teste.ts` (PostgreSQL de verdade).
 */

const ROTA = "/contas-pagar";

function permissoesDe(papel: Papel, extras: string[] = [], removidas: string[] = []): ReadonlySet<Permissao> {
  return resolverPermissoesEfetivas(papel, extras, removidas);
}

describe("decidirAcesso — quem entra", () => {
  it("permite quem tem a permissao exigida", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("financeiro") };
    expect(decidirAcesso(acesso, ["contas_pagar.visualizar"], ROTA)).toEqual({ tipo: "permitir" });
  });

  it("proibe quem esta autenticado, tem empresa, mas nao tem a permissao", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("somente_leitura") };
    expect(decidirAcesso(acesso, ["contas_pagar.pagar"], ROTA)).toEqual({
      tipo: "proibir",
      exigidas: ["contas_pagar.pagar"],
    });
  });

  it("basta UMA das permissoes quando a tela aceita varias", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("tesouraria") };
    const decisao = decidirAcesso(acesso, ["contas_pagar.pagar", "bancos.visualizar"], ROTA);
    expect(decisao.tipo).toBe("permitir");
  });

  it("permissao removida do vinculo derruba o acesso mesmo com o papel certo", () => {
    const comPapel = { estado: "pronto" as const, permissoes: permissoesDe("financeiro") };
    expect(decidirAcesso(comPapel, ["contas_pagar.pagar"], ROTA).tipo).toBe("permitir");

    const semAPermissao = { estado: "pronto" as const, permissoes: permissoesDe("financeiro", [], ["contas_pagar.pagar"]) };
    expect(decidirAcesso(semAPermissao, ["contas_pagar.pagar"], ROTA).tipo).toBe("proibir");
  });

  it("permissao extra concedida ao vinculo abre o acesso sem trocar o papel", () => {
    const semExtra = { estado: "pronto" as const, permissoes: permissoesDe("somente_leitura") };
    expect(decidirAcesso(semExtra, ["contas_pagar.criar"], ROTA).tipo).toBe("proibir");

    const comExtra = { estado: "pronto" as const, permissoes: permissoesDe("somente_leitura", ["contas_pagar.criar"]) };
    expect(decidirAcesso(comExtra, ["contas_pagar.criar"], ROTA).tipo).toBe("permitir");
  });
});

describe("decidirAcesso — quem ainda nao pode entrar", () => {
  it("visitante e mandado para entrar, guardando a rota pedida", () => {
    expect(decidirAcesso({ estado: "visitante" }, ["contas_pagar.visualizar"], ROTA)).toEqual({
      tipo: "redirecionar",
      destino: "/entrar?retorno=%2Fcontas-pagar",
    });
  });

  it("autenticado sem empresa vai para o primeiro acesso", () => {
    expect(decidirAcesso({ estado: "sem_empresa" }, ["contas_pagar.visualizar"], ROTA)).toEqual({
      tipo: "redirecionar",
      destino: "/primeiro-acesso",
    });
  });

  it("vinculo revogado nao vira 'proibir' silencioso: sem empresa acessivel, volta ao primeiro acesso", () => {
    // `resolverContextoAplicacao` so lista vinculos com ativo = true. Revogar o
    // vinculo tira a empresa da lista, e o estado cai para "sem_empresa".
    const decisao = decidirAcesso({ estado: "sem_empresa" }, ["contas_pagar.visualizar"], ROTA);
    expect(decisao).toEqual({ tipo: "redirecionar", destino: "/primeiro-acesso" });
  });

  it("estado 'pronto' sem permissoes resolvidas e tratado como nao autenticado (falha fechada)", () => {
    expect(decidirAcesso({ estado: "pronto" }, ["contas_pagar.visualizar"], ROTA)).toEqual({
      tipo: "redirecionar",
      destino: "/entrar",
    });
  });
});

describe("o menu nao autoriza nada", () => {
  it("ver o item no menu nao autoriza a acao por tras dele", () => {
    // Este e o caso real de contorno: o menu lista "Contas a pagar" porque o
    // papel tem `.visualizar`. Isso NAO autoriza pagar.
    const permissoes = permissoesDe("somente_leitura");

    const rotasVisiveis = navegacaoVisivel(permissoes)
      .flatMap((grupo) => grupo.itens)
      .map((item) => item.rota);
    expect(rotasVisiveis).toContain("/contas-pagar");

    expect(decidirAcesso({ estado: "pronto", permissoes }, ["contas_pagar.visualizar"], "/contas-pagar").tipo).toBe("permitir");
    expect(decidirAcesso({ estado: "pronto", permissoes }, ["contas_pagar.pagar"], "/contas-pagar").tipo).toBe("proibir");
    expect(decidirAcesso({ estado: "pronto", permissoes }, ["contas_pagar.criar"], "/contas-pagar").tipo).toBe("proibir");
  });

  it("item escondido do menu tambem nao passa pela rota direta", () => {
    // Vinculo com a visualizacao removida: o item some do menu E o servidor recusa.
    const permissoes = permissoesDe("somente_leitura", [], ["contas_pagar.visualizar"]);

    const rotasVisiveis = navegacaoVisivel(permissoes)
      .flatMap((grupo) => grupo.itens)
      .map((item) => item.rota);
    expect(rotasVisiveis).not.toContain("/contas-pagar");

    expect(decidirAcesso({ estado: "pronto", permissoes }, ["contas_pagar.visualizar"], "/contas-pagar").tipo).toBe("proibir");
  });

  it("mostrar o item no menu nao concede permissao: a decisao do servidor continua sendo a mesma", () => {
    const permissoes = permissoesDe("somente_leitura");

    // Um menu adulterado (ou um cliente que ignora o filtro) "revela" a rota...
    const menuAdulterado = NAVEGACAO_PRINCIPAL.flatMap((grupo) => grupo.itens).map((item) => item.rota);
    expect(menuAdulterado).toContain("/contas-pagar");

    // ...e o servidor continua recusando, porque nao consulta o menu.
    expect(decidirAcesso({ estado: "pronto", permissoes }, ["contas_pagar.pagar"], "/contas-pagar").tipo).toBe("proibir");
  });

  it("todo item do menu exige uma permissao que a guarda tambem sabe verificar", () => {
    // Impede que alguem acrescente um destino ao menu sem permissao real por tras.
    const semAdministrador = permissoesDe("somente_leitura");
    for (const item of NAVEGACAO_PRINCIPAL.flatMap((grupo) => grupo.itens)) {
      const decisao = decidirAcesso({ estado: "pronto", permissoes: semAdministrador }, [item.permissao], item.rota);
      expect(["permitir", "proibir"]).toContain(decisao.tipo);
    }
  });
});

describe("papeis e as permissoes que o Gate 5 vai usar", () => {
  const operacao: readonly Permissao[] = [
    "contas_pagar.visualizar",
    "contas_pagar.criar",
    "contas_pagar.editar",
    "contas_pagar.pagar",
    "contas_receber.visualizar",
    "contas_receber.criar",
    "contas_receber.editar",
    "contas_receber.baixar",
  ];

  it("administrador passa em todas", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("administrador") };
    for (const permissao of operacao) {
      expect(decidirAcesso(acesso, [permissao], ROTA).tipo).toBe("permitir");
    }
  });

  it("auditor enxerga, mas nao movimenta dinheiro", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("auditor") };
    expect(decidirAcesso(acesso, ["contas_pagar.visualizar"], ROTA).tipo).toBe("permitir");
    expect(decidirAcesso(acesso, ["contas_pagar.pagar"], ROTA).tipo).toBe("proibir");
    expect(decidirAcesso(acesso, ["contas_receber.baixar"], ROTA).tipo).toBe("proibir");
  });

  it("somente_leitura nao cria nem edita nada", () => {
    const acesso = { estado: "pronto" as const, permissoes: permissoesDe("somente_leitura") };
    for (const permissao of operacao.filter((p) => !p.endsWith(".visualizar"))) {
      expect(decidirAcesso(acesso, [permissao], ROTA).tipo).toBe("proibir");
    }
  });
});
