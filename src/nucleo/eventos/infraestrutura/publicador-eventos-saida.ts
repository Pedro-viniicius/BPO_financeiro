import type { ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { EventoDominio, PublicadorEventos } from "../dominio/evento-dominio";
import { eventosSaida } from "./esquema";

/**
 * Publicador via outbox transacional: grava o evento na tabela `eventos_saida`
 * usando o MESMO executor (transacao) da operacao de negocio.
 * A entrega e feita depois por `EntregadorEventosSaida`.
 */
export class PublicadorEventosSaida implements PublicadorEventos {
  constructor(private readonly executor: ExecutorBancoDados) {}

  async publicar(evento: EventoDominio): Promise<void> {
    await this.executor.insert(eventosSaida).values({
      nome: evento.nome,
      organizacaoId: evento.organizacaoId ?? null,
      empresaId: evento.empresaId ?? null,
      usuarioId: evento.usuarioId ?? null,
      ocorridoEm: evento.ocorridoEm,
      dados: evento.dados,
    });
  }
}

/** Publicador em memoria para testes. */
export class PublicadorEventosEmMemoria implements PublicadorEventos {
  readonly publicados: EventoDominio[] = [];

  async publicar(evento: EventoDominio): Promise<void> {
    this.publicados.push(evento);
  }
}
