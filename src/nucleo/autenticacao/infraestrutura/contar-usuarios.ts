import { sql } from "drizzle-orm";

import { obterBancoDados } from "@/nucleo/banco-dados/publico";

import { user } from "./esquema-better-auth";

/** Quantidade de usuarios da instalacao. Zero = instalacao vazia. */
export async function contarUsuarios(): Promise<number> {
  const [linha] = await obterBancoDados().select({ total: sql<number>`count(*)::int` }).from(user);
  return linha?.total ?? 0;
}
