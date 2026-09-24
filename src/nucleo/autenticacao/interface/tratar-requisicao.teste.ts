import { describe, expect, it, vi } from "vitest";

import { ehCadastroPorEmail, tratarRequisicaoAutenticacao } from "./tratar-requisicao";

const BASE = "https://financeiro.exemplo.local/api/autenticacao";

function cadastro(email: string): Request {
  return new Request(`${BASE}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://financeiro.exemplo.local" },
    body: JSON.stringify({ name: "Alguem", email, password: "senha-forte-para-teste-123" }),
  });
}

describe("portao do cadastro publico", () => {
  it("reconhece a rota de cadastro com e sem barra final, e ignora a query", () => {
    expect(ehCadastroPorEmail("/api/autenticacao/sign-up/email")).toBe(true);
    expect(ehCadastroPorEmail("/api/autenticacao/sign-up/email/")).toBe(true);
    expect(ehCadastroPorEmail("/api/autenticacao/Sign-Up/Email?x=1")).toBe(true);
    expect(ehCadastroPorEmail("/api/autenticacao/sign-in/email")).toBe(false);
    expect(ehCadastroPorEmail("/api/autenticacao/sign-up/social")).toBe(false);
  });

  it("com o cadastro FECHADO, responde 403 igual para e-mail existente e inexistente, sem chamar a biblioteca", async () => {
    const handler = vi.fn(async () => new Response("nunca", { status: 200 }));
    const dependencias = { cadastroAberto: async () => false, handler };

    const existente = await tratarRequisicaoAutenticacao(cadastro("ja-existe@exemplo.local"), dependencias);
    const inexistente = await tratarRequisicaoAutenticacao(cadastro("novo@exemplo.local"), dependencias);

    expect(existente.status).toBe(403);
    expect(inexistente.status).toBe(existente.status);
    expect(await inexistente.text()).toBe(await existente.text());
    expect(handler).not.toHaveBeenCalled();
  });

  it("com o cadastro fechado, um e-mail COM CONVITE PENDENTE tambem recebe 403: a porta e o token, nao o e-mail", async () => {
    // Antes, o gancho da biblioteca abria a porta para qualquer e-mail com
    // convite pendente — e qualquer pessoa que soubesse o e-mail criava a
    // conta antes do convidado. O convite entra por `aceitarConvite`, nunca por aqui.
    const handler = vi.fn(async () => new Response("criado", { status: 200 }));
    const resposta = await tratarRequisicaoAutenticacao(cadastro("convidado@exemplo.local"), { cadastroAberto: async () => false, handler });
    expect(resposta.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("com o cadastro ABERTO, o pedido segue para a biblioteca", async () => {
    const handler = vi.fn(async () => new Response("criado", { status: 200 }));
    const resposta = await tratarRequisicaoAutenticacao(cadastro("primeiro@exemplo.local"), { cadastroAberto: async () => true, handler });
    expect(resposta.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("as demais rotas seguem para a biblioteca mesmo com o cadastro fechado", async () => {
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const entrar = new Request(`${BASE}/sign-in/email`, { method: "POST", body: "{}" });
    await tratarRequisicaoAutenticacao(entrar, { cadastroAberto: async () => false, handler });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a ativacao do segundo fator continua fechada, antes de qualquer outra coisa", async () => {
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const ativar = new Request(`${BASE}/two-factor/enable`, { method: "POST", body: "{}" });
    const resposta = await tratarRequisicaoAutenticacao(ativar, { cadastroAberto: async () => true, handler });
    expect(resposta.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
