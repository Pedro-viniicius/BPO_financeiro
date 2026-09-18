import type { EventoAuditoria } from "../dominio/evento-auditoria";

/**
 * Contrato do registrador de auditoria.
 *
 * Os casos de uso dependem deste contrato, nao da implementacao Drizzle.
 * Quando a gravacao precisa ser atomica com a operacao financeira, o caso de
 * uso passa a transacao em andamento para a implementacao (ver
 * `RegistradorAuditoriaDrizzle`).
 */
export interface RegistradorAuditoria {
  registrar(evento: EventoAuditoria): Promise<void>;
}

/** Implementacao em memoria para testes de casos de uso. */
export class RegistradorAuditoriaEmMemoria implements RegistradorAuditoria {
  readonly eventos: EventoAuditoria[] = [];

  async registrar(evento: EventoAuditoria): Promise<void> {
    this.eventos.push(evento);
  }
}
