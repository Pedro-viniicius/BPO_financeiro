import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Configuracao do Vitest (executor de testes).
 * Arquivos de teste seguem o padrao `*.teste.ts` ao lado do codigo testado.
 */

/**
 * Carrega o `.env` local quando ele existe.
 *
 * Os testes de integracao leem `BANCO_URL_TESTE` de `process.env`, e o Vitest
 * nao repassa arquivos `.env` sozinho. Sem isto, quem tem PostgreSQL local ve
 * as suites de banco puladas mesmo com o banco no ar.
 *
 * `process.loadEnvFile` nao sobrescreve variavel ja definida no ambiente: na
 * CI, que exporta `BANCO_URL_TESTE` no workflow, o valor do workflow continua
 * valendo. Em producao nao existe `.env` versionado, entao nada e carregado.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.teste.ts", "src/**/*.teste.tsx"],
    environment: "node",
    passWithNoTests: false,
  },
});
