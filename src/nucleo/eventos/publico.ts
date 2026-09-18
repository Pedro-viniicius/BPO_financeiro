/** Interface publica do modulo de eventos de dominio (outbox transacional). */
export type { EventoDominio, ManipuladorEvento, PublicadorEventos } from "./dominio/evento-dominio";
export { PublicadorEventosEmMemoria, PublicadorEventosSaida } from "./infraestrutura/publicador-eventos-saida";
export { EntregadorEventosSaida } from "./infraestrutura/entregador-eventos-saida";
