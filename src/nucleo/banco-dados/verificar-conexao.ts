import { sql } from "drizzle-orm";

import { obterBancoDados } from "./conexao";

/** Executa `select 1`. Devolve `true` se o banco respondeu. Usado pela verificacao de saude. */
export async function verificarConexaoBanco(): Promise<boolean> {
  try {
    await obterBancoDados().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
