/** Interface publica do modulo de tarefas em segundo plano. */
export type { EstadoTarefa, FilaTarefas, ManipuladorTarefa, PedidoTarefa, Tarefa } from "./dominio/tarefa";
export { ExecutorTarefas, calcularAtrasoReagendamento } from "./aplicacao/executor-tarefas";
export { FilaTarefasPostgres } from "./infraestrutura/fila-tarefas-postgres";
export { FilaTarefasEmMemoria } from "./infraestrutura/fila-tarefas-em-memoria";
