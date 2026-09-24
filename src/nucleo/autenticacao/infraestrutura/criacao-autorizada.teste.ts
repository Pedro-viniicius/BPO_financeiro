import { describe, expect, it } from "vitest";

import { criacaoAutorizada, podeCriarUsuario } from "./criacao-autorizada";

describe("criacao de usuario autorizada", () => {
  it("com o cadastro FECHADO, so a criacao marcada pelo convite passa", () => {
    expect(podeCriarUsuario(undefined, false)).toBe(false);
    expect(podeCriarUsuario({ porConvite: true }, false)).toBe(true);
  });

  it("com o cadastro aberto, a rota publica passa (primeiro usuario, ou fora de producao)", () => {
    expect(podeCriarUsuario(undefined, true)).toBe(true);
  });

  it("a marca acompanha a cadeia de await ate onde o gancho roda", async () => {
    // Simula o que acontece por dentro do Better Auth: varios `await` entre a
    // chamada de `criarUsuarioComSenha` e o gancho `user.create.before`.
    const lidaNoGancho = await criacaoAutorizada.run({ porConvite: true }, async () => {
      await Promise.resolve();
      await new Promise((resolver) => setTimeout(resolver, 1));
      return criacaoAutorizada.getStore();
    });
    expect(lidaNoGancho).toEqual({ porConvite: true });
  });

  it("fora do `run`, nao ha marca: uma requisicao publica nunca a enxerga", async () => {
    await criacaoAutorizada.run({ porConvite: true }, async () => Promise.resolve());
    expect(criacaoAutorizada.getStore()).toBeUndefined();
    expect(podeCriarUsuario(criacaoAutorizada.getStore(), false)).toBe(false);
  });
});
