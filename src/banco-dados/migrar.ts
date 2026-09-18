import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Aplica as migracoes pendentes em `src/banco-dados/migracoes/`.
 *
 * Uso: `pnpm banco:migrar`
 *
 * Conecta com o usuario de migracao (`BANCO_URL_MIGRACAO`), que tem permissao
 * de alterar a estrutura. Se a variavel nao existir, usa `BANCO_URL` (util em
 * desenvolvimento). Em producao, as duas devem ser diferentes.
 * Ver docs/arquitetura/banco-dados.md.
 */
async function migrar(): Promise<void> {
  const url = process.env.BANCO_URL_MIGRACAO ?? process.env.BANCO_URL;
  if (!url) {
    console.error("Defina BANCO_URL_MIGRACAO (ou BANCO_URL) para aplicar migracoes.");
    process.exit(1);
  }
  const cliente = postgres(url, { max: 1 });
  const banco = drizzle(cliente, { casing: "snake_case" });
  try {
    console.log("Aplicando migracoes pendentes...");
    // A tabela de controle fica no esquema public: o usuario de migracao nao precisa criar esquemas.
    await migrate(banco, {
      migrationsFolder: "src/banco-dados/migracoes",
      migrationsTable: "migracoes_aplicadas",
      migrationsSchema: "public",
    });
    console.log("Migracoes aplicadas com sucesso.");
  } finally {
    await cliente.end();
  }
}

migrar().catch((erro: unknown) => {
  console.error("Falha ao aplicar migracoes:", erro);
  process.exit(1);
});
