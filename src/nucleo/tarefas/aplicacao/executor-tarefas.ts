import type { FilaTarefas, ManipuladorTarefa, Tarefa } from "../dominio/tarefa";

export interface RegistradorLogsExecutor {
  info(mensagem: string, dados?: Record<string, unknown>): void;
  erro(mensagem: string, dados?: Record<string, unknown>): void;
}

/**
 * Executor de tarefas: pega a proxima tarefa da fila, encontra o manipulador
 * pelo `tipo` e executa. Em caso de erro, registra a falha e a fila decide se
 * reagenda (com atraso crescente) ou marca como falhou.
 *
 * Nao conhece PostgreSQL: depende apenas do contrato `FilaTarefas`.
 */
export class ExecutorTarefas {
  private readonly manipuladores = new Map<string, ManipuladorTarefa>();

  constructor(
    private readonly fila: FilaTarefas,
    private readonly logs: RegistradorLogsExecutor,
  ) {}

  registrar(manipulador: ManipuladorTarefa): void {
    if (this.manipuladores.has(manipulador.tipo)) {
      throw new Error(`Ja existe manipulador para o tipo de tarefa "${manipulador.tipo}".`);
    }
    this.manipuladores.set(manipulador.tipo, manipulador);
  }

  tiposRegistrados(): string[] {
    return [...this.manipuladores.keys()];
  }

  /** Executa no maximo uma tarefa. Devolve `true` se executou algo. */
  async executarProxima(): Promise<boolean> {
    const tarefa = await this.fila.reservarProxima(this.tiposRegistrados());
    if (!tarefa) return false;
    await this.executar(tarefa);
    return true;
  }

  /** Executa tarefas ate a fila esvaziar ou atingir o limite. Devolve quantas executou. */
  async executarAteEsvaziar(limite = 100): Promise<number> {
    let executadas = 0;
    while (executadas < limite && (await this.executarProxima())) {
      executadas += 1;
    }
    return executadas;
  }

  private async executar(tarefa: Tarefa): Promise<void> {
    const manipulador = this.manipuladores.get(tarefa.tipo);
    if (!manipulador) {
      await this.fila.marcarFalha(tarefa.id, `Nenhum manipulador para "${tarefa.tipo}".`, 0);
      return;
    }
    const inicio = Date.now();
    try {
      await manipulador.executar(tarefa);
      await this.fila.marcarConcluida(tarefa.id);
      this.logs.info("tarefa concluida", { tarefaId: tarefa.id, tipo: tarefa.tipo, duracaoMs: Date.now() - inicio });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.fila.marcarFalha(tarefa.id, mensagem, calcularAtrasoReagendamento(tarefa.tentativas));
      this.logs.erro("tarefa falhou", { tarefaId: tarefa.id, tipo: tarefa.tipo, tentativa: tarefa.tentativas, erro: mensagem });
    }
  }
}

/** Atraso crescente entre tentativas: 5s, 25s, 2min, 10min, 50min (limite de 1h). */
export function calcularAtrasoReagendamento(tentativa: number): number {
  const base = 5_000;
  return Math.min(base * 5 ** Math.max(0, tentativa - 1), 3_600_000);
}
