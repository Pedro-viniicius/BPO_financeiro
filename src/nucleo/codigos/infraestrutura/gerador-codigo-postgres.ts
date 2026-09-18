import { sql } from "drizzle-orm";

import type { IdEmpresa } from "@/compartilhado/tipos/identificadores";
import type { ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import { formatarCodigo, type GeradorCodigo, type PrefixoCodigo } from "../aplicacao/gerador-codigo";
import { sequenciasCodigo } from "./esquema";

/**
 * Geracao de codigos legiveis usando a tabela `sequencias_codigo`.
 *
 * Um unico comando `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` trava a
 * linha da sequencia ate o fim da transacao: duas transacoes simultaneas
 * recebem numeros diferentes. Se uma delas for desfeita, o numero e perdido —
 * lacunas sao aceitaveis; codigos repetidos nao.
 */
export class GeradorCodigoPostgres implements GeradorCodigo {
  constructor(private readonly executor: ExecutorBancoDados) {}

  async gerarProximo(empresaId: IdEmpresa, prefixo: PrefixoCodigo, ano: number): Promise<string> {
    const linhas = await this.executor
      .insert(sequenciasCodigo)
      .values({ empresaId, prefixo, ano, ultimoNumero: 1 })
      .onConflictDoUpdate({
        target: [sequenciasCodigo.empresaId, sequenciasCodigo.prefixo, sequenciasCodigo.ano],
        set: { ultimoNumero: sql`${sequenciasCodigo.ultimoNumero} + 1`, atualizadoEm: new Date() },
      })
      .returning({ numero: sequenciasCodigo.ultimoNumero });

    const numero = linhas[0]?.numero;
    if (numero === undefined) {
      throw new Error("Falha ao gerar codigo: a sequencia nao devolveu numero.");
    }
    return formatarCodigo(prefixo, ano, numero);
  }
}
