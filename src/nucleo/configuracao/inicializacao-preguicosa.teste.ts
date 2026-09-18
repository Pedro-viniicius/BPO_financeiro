import { describe, expect, it } from "vitest";

/**
 * Fronteira build x runtime (docs/arquitetura/autenticacao-e-empresa-ativa.md,
 * secao 9): importar os modulos publicos de autenticacao, empresas e banco
 * NAO pode ler variaveis de ambiente nem abrir conexao. E isso que permite ao
 * `next build` avaliar os modulos sem PostgreSQL. Se alguem mover
 * `obterBancoDados()`/`obterAutenticacao()` para o nivel do modulo, este
 * teste falha antes do build.
 */
describe("inicializacao preguicosa (o build nao depende do banco)", () => {
  it("importar os modulos publicos sem BANCO_URL nem APLICACAO_SEGREDO nao lanca", async () => {
    const original = { ...process.env };
    for (const nome of ["BANCO_URL", "BANCO_URL_MIGRACAO", "APLICACAO_URL", "APLICACAO_SEGREDO"]) {
      delete process.env[nome];
    }
    try {
      // Modulo interno de proposito: `limparCacheVariaveisAmbiente` existe so para testes.
      const configuracao = await import("./variaveis-ambiente");
      configuracao.limparCacheVariaveisAmbiente();

      const banco = await import("@/nucleo/banco-dados/publico");
      const autenticacao = await import("@/nucleo/autenticacao/publico");
      const empresas = await import("@/nucleo/empresas/publico");

      expect(typeof banco.obterBancoDados).toBe("function");
      expect(typeof autenticacao.obterAutenticacao).toBe("function");
      expect(typeof empresas.resolverContextoAplicacao).toBe("function");
      // A prova de que nada foi inicializado: ler as variaveis agora falha.
      expect(() => configuracao.obterVariaveisAmbiente()).toThrow("Configuracao invalida");
    } finally {
      process.env = original;
      (await import("./variaveis-ambiente")).limparCacheVariaveisAmbiente();
    }
  });
});
