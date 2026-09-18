import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as esquema from "@/banco-dados/esquemas/indice";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";

/**
 * Conexao com o PostgreSQL via Drizzle.
 *
 * - Usa o usuario da aplicacao (`BANCO_URL`), que NAO tem permissao para
 *   alterar estrutura (DDL). Migracoes usam `BANCO_URL_MIGRACAO`.
 * - Uma unica instancia por processo (pool de conexoes).
 * - Nenhum modulo de dominio importa este arquivo: apenas as implementacoes
 *   Drizzle dos repositorios (pasta `infraestrutura/` de cada modulo).
 */
export type BancoDados = ReturnType<typeof criarBancoDados>;

/** Transacao Drizzle: o mesmo contrato do banco, valido apenas dentro de `executarEmTransacao`. */
export type TransacaoBancoDados = Parameters<Parameters<BancoDados["transaction"]>[0]>[0];

/** Aceita tanto a conexao principal quanto uma transacao. Repositorios devem receber este tipo. */
export type ExecutorBancoDados = BancoDados | TransacaoBancoDados;

function criarBancoDados(url: string, maximoConexoes: number) {
  const cliente = postgres(url, {
    max: maximoConexoes,
    // Nunca converte NUMERIC para number: valores monetarios chegam como texto e viram `Dinheiro`.
    transform: { undefined: null },
  });
  return drizzle(cliente, { schema: esquema, casing: "snake_case" });
}

const globalComBanco = globalThis as typeof globalThis & { __bancoDadosFinanceiro?: BancoDados };

/** Obtem a conexao unica da aplicacao (criada na primeira chamada). */
export function obterBancoDados(): BancoDados {
  if (!globalComBanco.__bancoDadosFinanceiro) {
    const variaveis = obterVariaveisAmbiente();
    globalComBanco.__bancoDadosFinanceiro = criarBancoDados(variaveis.BANCO_URL, variaveis.BANCO_MAXIMO_CONEXOES);
  }
  return globalComBanco.__bancoDadosFinanceiro;
}

/**
 * Executa uma funcao dentro de uma transacao. Se a funcao lancar, tudo e desfeito.
 * Use para operacoes que escrevem em mais de uma tabela (ex.: registrar pagamento
 * + movimentacao + evento de saida + auditoria).
 */
export async function executarEmTransacao<T>(
  operacao: (transacao: TransacaoBancoDados) => Promise<T>,
  banco: BancoDados = obterBancoDados(),
): Promise<T> {
  return banco.transaction(operacao);
}
