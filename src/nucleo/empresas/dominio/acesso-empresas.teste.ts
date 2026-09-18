import { describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";

import { type EmpresaAcessivel, resolverEmpresaAtiva } from "./acesso-empresas";

function empresa(id: string, nome: string): EmpresaAcessivel {
  return {
    empresaId: comoIdentificador<"Empresa">(id),
    organizacaoId: comoIdentificador<"Organizacao">(`org-${id}`),
    nome,
    fusoHorario: "America/Sao_Paulo",
    papel: "financeiro",
    permissoesExtras: [],
    permissoesRemovidas: [],
    acessoPelaOrganizacao: false,
  };
}

describe("resolverEmpresaAtiva", () => {
  it("sem empresa acessivel: nenhuma ativa, mesmo com preferencia", () => {
    expect(resolverEmpresaAtiva([], "empresa-b")).toBeNull();
  });

  it("uma unica empresa vira ativa sem precisar de preferencia", () => {
    expect(resolverEmpresaAtiva([empresa("a", "Alfa")], undefined)?.empresaId).toBe("a");
  });

  it("varias empresas: a preferencia valida vence", () => {
    const lista = [empresa("a", "Alfa"), empresa("b", "Beta")];
    expect(resolverEmpresaAtiva(lista, "b")?.empresaId).toBe("b");
  });

  it("varias empresas sem preferencia valida: a primeira em ordem alfabetica", () => {
    const lista = [empresa("z", "Zeta"), empresa("b", "Beta"), empresa("m", "Mu")];
    expect(resolverEmpresaAtiva(lista, undefined)?.empresaId).toBe("b");
    expect(resolverEmpresaAtiva(lista, "nao-existe")?.empresaId).toBe("b");
  });

  it("preferencia (cookie) apontando para empresa de OUTRO usuario e ignorada", () => {
    // O usuario so tem "a"; o cookie diz "b" (empresa alheia, ou vinculo revogado).
    const ativa = resolverEmpresaAtiva([empresa("a", "Alfa")], "b");
    expect(ativa?.empresaId).toBe("a");
  });
});
