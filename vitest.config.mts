import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Configuracao do Vitest (executor de testes).
 * Arquivos de teste seguem o padrao `*.teste.ts` ao lado do codigo testado.
 */
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
