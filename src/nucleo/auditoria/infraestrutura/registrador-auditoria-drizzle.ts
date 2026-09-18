import type { ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { RegistradorAuditoria } from "../aplicacao/registrador-auditoria";
import type { EventoAuditoria } from "../dominio/evento-auditoria";
import { eventosAuditoria } from "./esquema";

/**
 * Grava eventos de auditoria no PostgreSQL.
 * Recebe o executor (conexao ou transacao) para que o evento seja gravado na
 * mesma transacao da operacao financeira quando necessario.
 */
export class RegistradorAuditoriaDrizzle implements RegistradorAuditoria {
  constructor(private readonly executor: ExecutorBancoDados) {}

  async registrar(evento: EventoAuditoria): Promise<void> {
    await this.executor.insert(eventosAuditoria).values({
      acao: evento.acao,
      entidade: evento.entidade,
      entidadeId: evento.entidadeId ?? null,
      organizacaoId: evento.organizacaoId ?? null,
      empresaId: evento.empresaId ?? null,
      usuarioId: evento.usuarioId ?? null,
      origem: evento.origem,
      dadosAntes: evento.dadosAntes ?? null,
      dadosDepois: evento.dadosDepois ?? null,
      ip: evento.ip ?? null,
      agenteUsuario: evento.agenteUsuario ?? null,
      requisicaoId: evento.requisicaoId ?? null,
    });
  }
}
