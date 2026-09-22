import { describe, expect, it } from "vitest";

import { ligacaoDeRedefinicao, montarMensagemRedefinicaoSenha } from "./mensagem-redefinicao-senha";

const BASE = {
  para: "ana@exemplo.local",
  nome: "Ana Diretora",
  token: "abc123",
  aplicacaoUrl: "https://financeiro.exemplo.com.br",
  validadeEmMinutos: 30,
} as const;

describe("ligacaoDeRedefinicao", () => {
  it("aponta para a tela do produto, nao para a rota da biblioteca", () => {
    expect(ligacaoDeRedefinicao(BASE.aplicacaoUrl, "abc123")).toBe(
      "https://financeiro.exemplo.com.br/redefinir-senha?token=abc123",
    );
  });

  it("nao duplica barra quando a URL da aplicacao termina em /", () => {
    expect(ligacaoDeRedefinicao("https://exemplo.com.br/", "t")).toBe("https://exemplo.com.br/redefinir-senha?token=t");
  });

  it("escapa o token para ele sobreviver a query", () => {
    expect(ligacaoDeRedefinicao(BASE.aplicacaoUrl, "a b&c=d")).toContain("token=a%20b%26c%3Dd");
  });
});

describe("montarMensagemRedefinicaoSenha", () => {
  it("vai para o endereco da conta, com assunto claro", () => {
    const mensagem = montarMensagemRedefinicaoSenha(BASE);
    expect(mensagem.para).toBe("ana@exemplo.local");
    expect(mensagem.assunto).toBe("Redefinir a sua senha");
  });

  it("trata a pessoa pelo primeiro nome", () => {
    expect(montarMensagemRedefinicaoSenha(BASE).texto).toContain("Ola, Ana.");
  });

  it("contem o link e diz por quanto tempo ele vale", () => {
    const texto = montarMensagemRedefinicaoSenha(BASE).texto;
    expect(texto).toContain("https://financeiro.exemplo.com.br/redefinir-senha?token=abc123");
    expect(texto).toContain("30 minutos");
    expect(texto).toContain("uma vez");
  });

  it("diz a quem NAO pediu que nao ha nada a fazer", () => {
    // Sem esta linha, o e-mail parece um aviso de invasao e gera panico/suporte.
    expect(montarMensagemRedefinicaoSenha(BASE).texto).toContain("Se nao foi voce que pediu");
  });

  it("nao promete nada que o sistema nao faz (sem anexo, sem HTML obrigatorio)", () => {
    const mensagem = montarMensagemRedefinicaoSenha(BASE);
    expect(mensagem.html).toBeUndefined();
    expect(mensagem.texto.length).toBeGreaterThan(0);
  });
});
