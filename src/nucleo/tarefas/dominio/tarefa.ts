import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";

/** Estados possiveis de uma tarefa em segundo plano. */
export type EstadoTarefa = "pendente" | "executando" | "concluida" | "falhou";

/** Pedido para enfileirar uma tarefa. */
export interface PedidoTarefa<Dados = Record<string, unknown>> {
  /** Ex.: "importacao.processar_ofx". Precisa ter um manipulador registrado. */
  readonly tipo: string;
  readonly dados: Dados;
  /** Quando executar. Padrao: agora. */
  readonly agendadaPara?: Date;
  readonly maximoTentativas?: number;
  /** Se informada, uma segunda tarefa com a mesma chave nao e enfileirada. */
  readonly chaveIdempotencia?: string;
  readonly organizacaoId?: IdOrganizacao;
  readonly empresaId?: IdEmpresa;
  readonly usuarioId?: IdUsuario;
}

/** Tarefa persistida, como o executor a recebe. */
export interface Tarefa<Dados = Record<string, unknown>> extends PedidoTarefa<Dados> {
  readonly id: string;
  readonly estado: EstadoTarefa;
  readonly tentativas: number;
  readonly maximoTentativas: number;
  readonly criadaEm: Date;
}

/**
 * Contrato da fila de tarefas.
 *
 * A implementacao inicial usa PostgreSQL (ADR-012). Se um dia houver
 * necessidade comprovada de outra infraestrutura (Redis, SQS...), basta
 * criar outra implementacao deste contrato: os casos de uso nao mudam.
 */
export interface FilaTarefas {
  /** Enfileira e devolve o id. Devolve `null` se a chave de idempotencia ja existir. */
  enfileirar(pedido: PedidoTarefa): Promise<string | null>;
  /** Reserva a proxima tarefa pronta para execucao (ou `null` se nao houver). */
  reservarProxima(tipos?: readonly string[]): Promise<Tarefa | null>;
  marcarConcluida(id: string): Promise<void>;
  /** Registra a falha; se ainda houver tentativas, reagenda com o atraso informado. */
  marcarFalha(id: string, erro: string, reagendarEmMs: number): Promise<void>;
}

/** Quem executa um tipo de tarefa. */
export interface ManipuladorTarefa<Dados = Record<string, unknown>> {
  readonly tipo: string;
  executar(tarefa: Tarefa<Dados>): Promise<void>;
}
