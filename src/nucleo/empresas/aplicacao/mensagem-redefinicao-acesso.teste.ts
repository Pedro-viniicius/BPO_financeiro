import { describe, expect, it } from "vitest";

import { montarMensagemRedefinicaoAcesso } from "./mensagem-redefinicao-acesso";

describe("mensagem de redefinicao de acesso", () => {
  const mensagem = montarMensagemRedefinicaoAcesso({
    para: "pessoa@exemplo.local",
    token: "token-de-teste",
    aplicacaoUrl: "https://financeiro.exemplo.local/",
    nomeDaEmpresa: "Empresa Exemplo",
  });

  it("vai para o e-mail do DONO da conta, com o link do convite", () => {
    expect(mensagem.para).toBe("pessoa@exemplo.local");
    expect(mensagem.texto).toContain("https://financeiro.exemplo.local/convite/token-de-teste");
  });

  it("diz quem pediu, quanto tempo vale e o que fazer se nao esperava", () => {
    expect(mensagem.texto).toContain("Empresa Exemplo");
    expect(mensagem.texto).toMatch(/48 horas/);
    expect(mensagem.texto).toMatch(/nao esperava/i);
  });
});
