import { describe, expect, it } from "vitest";

import { criarRegistradorLogs, redigirDadosSensiveis } from "./registrador-logs";

describe("registrador de logs", () => {
  it("redige chaves sensiveis em qualquer profundidade", () => {
    const resultado = redigirDadosSensiveis({
      usuario: "ana",
      senha: "123",
      integracao: { token: "abc", chaveApi: "x", url: "https://exemplo" },
      lista: [{ password: "p" }],
    });
    expect(resultado).toEqual({
      usuario: "ana",
      senha: "[redigido]",
      integracao: { token: "[redigido]", chaveApi: "[redigido]", url: "https://exemplo" },
      lista: [{ password: "[redigido]" }],
    });
  });

  it("escreve JSON com nivel, origem e contexto e respeita o nivel minimo", () => {
    const linhas: string[] = [];
    const logs = criarRegistradorLogs("teste", { nivelMinimo: "info", escrever: (l) => linhas.push(l) });
    logs.debug("ignorado");
    logs.comContexto({ requisicaoId: "req-1" }).info("ola", { valor: 1 });
    expect(linhas).toHaveLength(1);
    const registro = JSON.parse(linhas[0]!);
    expect(registro).toMatchObject({ nivel: "info", origem: "teste", mensagem: "ola", valor: 1, requisicaoId: "req-1" });
  });
});
