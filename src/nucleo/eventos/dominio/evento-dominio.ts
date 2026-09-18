import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";

/**
 * Evento de dominio: algo relevante que aconteceu e outros modulos podem
 * querer reagir (ex.: "conta_pagar.pagamento_registrado").
 *
 * Nomes seguem "<modulo>.<fato no participio>". `dados` contem apenas
 * identificadores e valores necessarios para reagir — nunca o objeto inteiro.
 */
export interface EventoDominio<Dados = Record<string, unknown>> {
  readonly nome: string;
  readonly organizacaoId?: IdOrganizacao;
  readonly empresaId?: IdEmpresa;
  readonly usuarioId?: IdUsuario;
  readonly ocorridoEm: Date;
  readonly dados: Dados;
}

/**
 * Contrato de publicacao. A implementacao padrao grava na tabela de saida
 * (outbox) dentro da transacao atual; uma tarefa em segundo plano entrega.
 */
export interface PublicadorEventos {
  publicar(evento: EventoDominio): Promise<void>;
}

/** Contrato de quem reage a eventos. Registrado por nome de evento. */
export interface ManipuladorEvento<Dados = Record<string, unknown>> {
  readonly nomeEvento: string;
  tratar(evento: EventoDominio<Dados>): Promise<void>;
}
