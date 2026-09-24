import { describe, expect, it, vi } from "vitest";

import { entregarRedefinicaoDeSenha } from "./entregar-redefinicao-senha";

const mensagem = { para: "pessoa@exemplo.local", assunto: "Redefinir a sua senha", texto: "..." };

describe("entrega da redefinicao de senha", () => {
  it("quando o provedor falha, NAO lanca: a resposta ao navegador fica igual a de e-mail desconhecido", async () => {
    const logs = { info: vi.fn(), erro: vi.fn() };
    const enviar = vi.fn(async () => {
      throw new Error("EMAIL_PROVEDOR=smtp, mas nenhum adaptador SMTP foi implementado ainda.");
    });

    await expect(entregarRedefinicaoDeSenha({ enviar, logs }, mensagem, "usuario-1")).resolves.toBe(false);

    // A falha nao some: vai para o log de erro, com o usuario, para a operacao agir.
    expect(logs.erro).toHaveBeenCalledWith(
      "falha ao enviar e-mail de redefinicao de senha",
      expect.objectContaining({ usuarioId: "usuario-1", erro: expect.stringContaining("SMTP") }),
    );
  });

  it("quando o provedor aceita, registra a entrega", async () => {
    const logs = { info: vi.fn(), erro: vi.fn() };
    const enviar = vi.fn(async () => undefined);

    await expect(entregarRedefinicaoDeSenha({ enviar, logs }, mensagem, "usuario-1")).resolves.toBe(true);
    expect(enviar).toHaveBeenCalledWith(mensagem);
    expect(logs.erro).not.toHaveBeenCalled();
  });
});
