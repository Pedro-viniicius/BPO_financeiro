import type { FilaTarefas, PedidoTarefa, Tarefa } from "../dominio/tarefa";

/** Fila em memoria para testes de casos de uso e do executor. */
export class FilaTarefasEmMemoria implements FilaTarefas {
  readonly itens: Array<Tarefa & { ultimoErro?: string; agendadaPara: Date }> = [];
  private contador = 0;

  async enfileirar(pedido: PedidoTarefa): Promise<string | null> {
    if (pedido.chaveIdempotencia && this.itens.some((t) => t.chaveIdempotencia === pedido.chaveIdempotencia)) {
      return null;
    }
    const id = `tarefa-${++this.contador}`;
    this.itens.push({
      ...pedido,
      id,
      estado: "pendente",
      tentativas: 0,
      maximoTentativas: pedido.maximoTentativas ?? 5,
      agendadaPara: pedido.agendadaPara ?? new Date(0),
      criadaEm: new Date(),
    });
    return id;
  }

  async reservarProxima(tipos?: readonly string[]): Promise<Tarefa | null> {
    const agora = Date.now();
    const candidata = this.itens
      .filter((t) => t.estado === "pendente" && t.agendadaPara.getTime() <= agora)
      .filter((t) => !tipos || tipos.length === 0 || tipos.includes(t.tipo))
      .sort((a, b) => a.agendadaPara.getTime() - b.agendadaPara.getTime())[0];
    if (!candidata) return null;
    Object.assign(candidata, { estado: "executando", tentativas: candidata.tentativas + 1 });
    return candidata;
  }

  async marcarConcluida(id: string): Promise<void> {
    const tarefa = this.itens.find((t) => t.id === id);
    if (tarefa) Object.assign(tarefa, { estado: "concluida" });
  }

  async marcarFalha(id: string, erro: string, reagendarEmMs: number): Promise<void> {
    const tarefa = this.itens.find((t) => t.id === id);
    if (!tarefa) return;
    const esgotou = tarefa.tentativas >= tarefa.maximoTentativas;
    Object.assign(tarefa, {
      estado: esgotou ? "falhou" : "pendente",
      ultimoErro: erro,
      agendadaPara: new Date(Date.now() + reagendarEmMs),
    });
  }
}
