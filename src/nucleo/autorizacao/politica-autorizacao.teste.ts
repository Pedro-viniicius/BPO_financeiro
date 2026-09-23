import { describe, expect, it } from "vitest";

import { UsuarioSemPermissao } from "./erros";
import { PAPEIS, PERMISSOES_POR_PAPEL } from "./papeis";
import { PERMISSOES } from "./permissoes";
import { exigirPermissao, possuiAlguma, possuiPermissao, possuiTodas, resolverPermissoesEfetivas } from "./politica-autorizacao";

describe("politica de autorizacao", () => {
  it("nega por padrao quando o conjunto esta vazio", () => {
    const portador = { permissoes: new Set<never>() };
    expect(possuiPermissao(portador, "contas_pagar.visualizar")).toBe(false);
    expect(() => exigirPermissao(portador, "contas_pagar.criar")).toThrow(UsuarioSemPermissao);
  });

  it("permite quando a permissao esta presente", () => {
    const portador = { permissoes: resolverPermissoesEfetivas("financeiro") };
    expect(possuiPermissao(portador, "contas_pagar.criar")).toBe(true);
    expect(() => exigirPermissao(portador, "contas_pagar.criar")).not.toThrow();
  });

  it("o papel financeiro nao aprova pagamentos (segregacao de funcoes)", () => {
    const financeiro = { permissoes: resolverPermissoesEfetivas("financeiro") };
    expect(possuiPermissao(financeiro, "contas_pagar.aprovar")).toBe(false);
    const tesouraria = { permissoes: resolverPermissoesEfetivas("tesouraria") };
    expect(possuiPermissao(tesouraria, "contas_pagar.aprovar")).toBe(true);
    expect(possuiPermissao(tesouraria, "contas_pagar.criar")).toBe(false);
  });

  it("somente leitura nao ve auditoria nem usuarios e nao escreve nada", () => {
    const leitura = resolverPermissoesEfetivas("somente_leitura");
    expect(leitura.has("auditoria.visualizar")).toBe(false);
    expect(leitura.has("usuarios.visualizar")).toBe(false);
    for (const permissao of leitura) {
      expect(permissao.endsWith(".visualizar")).toBe(true);
    }
  });

  it("aplica permissoes extras e removidas sobre o papel", () => {
    const efetivas = resolverPermissoesEfetivas("financeiro", ["dre.visualizar"], ["contas_pagar.cancelar"]);
    expect(efetivas.has("dre.visualizar")).toBe(true);
    expect(efetivas.has("contas_pagar.cancelar")).toBe(false);
  });

  it("ignora textos de permissao desconhecidos sem quebrar", () => {
    const efetivas = resolverPermissoesEfetivas("auditor", ["inexistente.fazer"], ["outra.inexistente"]);
    expect(efetivas.size).toBe(PERMISSOES_POR_PAPEL.auditor.size);
  });

  it("possuiTodas e possuiAlguma", () => {
    const portador = { permissoes: resolverPermissoesEfetivas("controladoria") };
    expect(possuiTodas(portador, ["dre.visualizar", "orcamento.editar"])).toBe(true);
    expect(possuiTodas(portador, ["dre.visualizar", "contas_pagar.pagar"])).toBe(false);
    expect(possuiAlguma(portador, ["contas_pagar.pagar", "dre.exportar"])).toBe(true);
  });

  it("administrador possui todas as permissoes e todo papel so contem permissoes conhecidas", () => {
    expect(PERMISSOES_POR_PAPEL.administrador.size).toBe(PERMISSOES.length);
    for (const papel of PAPEIS) {
      for (const permissao of PERMISSOES_POR_PAPEL[papel]) {
        expect(PERMISSOES).toContain(permissao);
      }
    }
  });
});

describe("dividas.cancelar (Gate 9)", () => {
  /**
   * Cancelar divida ganhou permissao propria porque tira do fluxo de caixa
   * todas as parcelas em aberto de uma vez — decisao de outra ordem que
   * corrigir uma taxa de juros. O espelho e `contas_pagar.cancelar`.
   */
  it("existe no catalogo", () => {
    expect(PERMISSOES).toContain("dividas.cancelar");
  });

  it("quem edita divida tambem cancela; quem so visualiza, nao", () => {
    for (const papel of PAPEIS) {
      const permissoes = PERMISSOES_POR_PAPEL[papel];
      if (permissoes.has("dividas.cancelar")) {
        expect(permissoes.has("dividas.editar"), `${papel} cancela divida sem poder edita-la`).toBe(true);
        expect(permissoes.has("dividas.visualizar"), `${papel} cancela divida sem poder ve-la`).toBe(true);
      }
    }
  });

  it("papeis de leitura nao cancelam", () => {
    expect(PERMISSOES_POR_PAPEL.somente_leitura.has("dividas.cancelar")).toBe(false);
    expect(PERMISSOES_POR_PAPEL.auditor.has("dividas.cancelar")).toBe(false);
  });
});
