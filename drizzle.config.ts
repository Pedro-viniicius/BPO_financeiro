import { defineConfig } from "drizzle-kit";

/**
 * Configuracao do drizzle-kit (ferramenta de linha de comando do Drizzle).
 *
 * - `schema`: arquivo que reune os esquemas de todos os modulos.
 * - `out`: pasta das migracoes SQL versionadas.
 * - `casing: snake_case`: nomes de colunas no banco em snake_case (`criado_em`)
 *   mesmo que no TypeScript sejam camelCase (`criadoEm`).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/banco-dados/esquemas/indice.ts",
  out: "./src/banco-dados/migracoes",
  casing: "snake_case",
  migrations: {
    table: "migracoes_aplicadas",
    schema: "public",
  },
  dbCredentials: {
    url: process.env.BANCO_URL_MIGRACAO ?? process.env.BANCO_URL ?? "",
  },
  strict: true,
  verbose: true,
});
