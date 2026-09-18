import { describe, expect, it } from "vitest";

import { decidirDestino, destinoPadrao, type EstadoAcesso, retornoSeguro, ROTAS } from "./destino";

const ESTADOS: readonly EstadoAcesso[] = ["visitante", "sem_empresa", "pronto"];

describe("decidirDestino — tabela de redirecionamentos", () => {
  it("visitante em rota da aplicacao vai para /entrar com retorno", () => {
    expect(decidirDestino("visitante", "/inicio")).toBe("/entrar?retorno=%2Finicio");
    expect(decidirDestino("visitante", "/contas-pagar?aba=vencidas")).toBe("/entrar?retorno=%2Fcontas-pagar%3Faba%3Dvencidas");
  });

  it("autenticado sem empresa em rota da aplicacao vai para /primeiro-acesso", () => {
    expect(decidirDestino("sem_empresa", "/inicio")).toBe(ROTAS.primeiroAcesso);
    expect(decidirDestino("sem_empresa", "/contas-pagar")).toBe(ROTAS.primeiroAcesso);
  });

  it("pronto renderiza a rota da aplicacao", () => {
    expect(decidirDestino("pronto", "/inicio")).toBeNull();
    expect(decidirDestino("pronto", "/contas-pagar/CP-2026-000001")).toBeNull();
  });

  it("/entrar e /criar-conta: visitante ve; quem ja entrou segue adiante", () => {
    expect(decidirDestino("visitante", "/entrar")).toBeNull();
    expect(decidirDestino("visitante", "/criar-conta")).toBeNull();
    expect(decidirDestino("sem_empresa", "/entrar")).toBe(ROTAS.primeiroAcesso);
    expect(decidirDestino("pronto", "/entrar")).toBe(ROTAS.inicio);
    expect(decidirDestino("pronto", "/criar-conta")).toBe(ROTAS.inicio);
  });

  it("/primeiro-acesso: exige sessao; quem ja tem empresa nao repete o instalador", () => {
    expect(decidirDestino("visitante", "/primeiro-acesso")).toBe("/entrar?retorno=%2Fprimeiro-acesso");
    expect(decidirDestino("sem_empresa", "/primeiro-acesso")).toBeNull();
    expect(decidirDestino("pronto", "/primeiro-acesso")).toBe(ROTAS.inicio);
  });

  it("/ leva cada estado ao destino padrao", () => {
    expect(decidirDestino("visitante", "/")).toBe(ROTAS.entrar);
    expect(decidirDestino("sem_empresa", "/")).toBe(ROTAS.primeiroAcesso);
    expect(decidirDestino("pronto", "/")).toBe(ROTAS.inicio);
  });

  it("nao existe ciclo: o destino de um destino e ele mesmo (para todo estado e rota)", () => {
    const rotas = ["/", "/entrar", "/criar-conta", "/primeiro-acesso", "/inicio", "/contas-pagar", "/configuracoes/usuarios"];
    for (const estado of ESTADOS) {
      for (const rota of rotas) {
        const primeiro = decidirDestino(estado, rota);
        if (primeiro === null) continue;
        expect(decidirDestino(estado, primeiro), `${estado} em ${rota} -> ${primeiro}`).toBeNull();
      }
      expect(decidirDestino(estado, destinoPadrao(estado))).toBeNull();
    }
  });
});

describe("retornoSeguro", () => {
  it("aceita apenas caminhos relativos do proprio site", () => {
    expect(retornoSeguro("/contas-pagar?aba=vencidas")).toBe("/contas-pagar?aba=vencidas");
    expect(retornoSeguro("/inicio")).toBe("/inicio");
  });

  it("rejeita redirecionamento aberto e rotas de entrada", () => {
    expect(retornoSeguro("https://atacante.example")).toBeNull();
    expect(retornoSeguro("//atacante.example")).toBeNull();
    expect(retornoSeguro("/\\atacante.example")).toBeNull();
    expect(retornoSeguro("javascript:alert(1)")).toBeNull();
    expect(retornoSeguro("/inicio\r\nSet-Cookie: x=1")).toBeNull();
    expect(retornoSeguro("/entrar")).toBeNull();
    expect(retornoSeguro("/criar-conta?x=1")).toBeNull();
    expect(retornoSeguro("/")).toBeNull();
    expect(retornoSeguro("")).toBeNull();
    expect(retornoSeguro(null)).toBeNull();
  });
});
