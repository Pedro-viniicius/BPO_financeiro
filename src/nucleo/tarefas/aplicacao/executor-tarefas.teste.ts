import { describe, expect, it } from "vitest";

import { FilaTarefasEmMemoria } from "../infraestrutura/fila-tarefas-em-memoria";
import { calcularAtrasoReagendamento, ExecutorTarefas } from "./executor-tarefas";

const logsSilenciosos = { info: () => undefined, erro: () => undefined };

describe("ExecutorTarefas", () => {
  it("executa a tarefa com o manipulador do tipo e marca como concluida", async () => {
    const fila = new FilaTarefasEmMemoria();
    const executor = new ExecutorTarefas(fila, logsSilenciosos);
    const executadas: string[] = [];
    executor.registrar({
      tipo: "teste.somar",
      executar: async (tarefa) => {
        executadas.push(String(tarefa.dados.valor));
      },
    });
    await fila.enfileirar({ tipo: "teste.somar", dados: { valor: 1 } });
    await fila.enfileirar({ tipo: "teste.somar", dados: { valor: 2 } });

    expect(await executor.executarAteEsvaziar()).toBe(2);
    expect(executadas).toEqual(["1", "2"]);
    expect(fila.itens.every((t) => t.estado === "concluida")).toBe(true);
  });

  it("reagenda em caso de erro e marca como falhou ao esgotar tentativas", async () => {
    const fila = new FilaTarefasEmMemoria();
    const executor = new ExecutorTarefas(fila, logsSilenciosos);
    executor.registrar({
      tipo: "teste.falhar",
      executar: async () => {
        throw new Error("falha proposital");
      },
    });
    await fila.enfileirar({ tipo: "teste.falhar", dados: {}, maximoTentativas: 2, agendadaPara: new Date(0) });

    expect(await executor.executarProxima()).toBe(true);
    expect(fila.itens[0]?.estado).toBe("pendente");
    expect(fila.itens[0]?.ultimoErro).toBe("falha proposital");

    // forca a data para "agora" e executa de novo
    Object.assign(fila.itens[0]!, { agendadaPara: new Date(0) });
    expect(await executor.executarProxima()).toBe(true);
    expect(fila.itens[0]?.estado).toBe("falhou");
  });

  it("nao enfileira duas vezes a mesma chave de idempotencia", async () => {
    const fila = new FilaTarefasEmMemoria();
    expect(await fila.enfileirar({ tipo: "x", dados: {}, chaveIdempotencia: "arquivo-abc" })).not.toBeNull();
    expect(await fila.enfileirar({ tipo: "x", dados: {}, chaveIdempotencia: "arquivo-abc" })).toBeNull();
  });

  it("nao pega tarefas de tipos sem manipulador registrado", async () => {
    const fila = new FilaTarefasEmMemoria();
    const executor = new ExecutorTarefas(fila, logsSilenciosos);
    executor.registrar({ tipo: "conhecido", executar: async () => undefined });
    await fila.enfileirar({ tipo: "desconhecido", dados: {} });
    expect(await executor.executarProxima()).toBe(false);
    expect(fila.itens[0]?.estado).toBe("pendente");
  });

  it("calcula atraso crescente limitado a uma hora", () => {
    expect(calcularAtrasoReagendamento(1)).toBe(5_000);
    expect(calcularAtrasoReagendamento(2)).toBe(25_000);
    expect(calcularAtrasoReagendamento(3)).toBe(125_000);
    expect(calcularAtrasoReagendamento(10)).toBe(3_600_000);
  });
});
