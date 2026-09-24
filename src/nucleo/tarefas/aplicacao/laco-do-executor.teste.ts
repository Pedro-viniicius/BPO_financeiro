import { describe, expect, it } from "vitest";

import type { DataCivil } from "@/compartilhado/datas/indice";

import { FilaTarefasEmMemoria } from "../infraestrutura/fila-tarefas-em-memoria";
import { rodarLacoDoExecutor } from "./laco-do-executor";

const logs = { info() {}, erro() {} };

describe("laco do executor", () => {
  it("enfileira os pedidos diarios uma vez por dia e executa o manipulador registrado", async () => {
    const fila = new FilaTarefasEmMemoria();
    const executados: string[] = [];
    let ciclos = 0;
    let dia = "2026-09-24" as DataCivil;
    await rodarLacoDoExecutor({
      fila,
      manipuladores: [{ tipo: "teste.diario", async executar(tarefa) { executados.push(String(tarefa.dados.dia)); } }],
      pedidosDiarios: (hoje) => [{ tipo: "teste.diario", dados: { dia: hoje }, chaveIdempotencia: `teste.diario:${hoje}` }],
      hoje: () => {
        ciclos += 1;
        if (ciclos === 4) dia = "2026-09-25" as DataCivil; // o dia vira no quarto ciclo
        return dia;
      },
      intervaloMs: 1,
      logs,
      encerrando: () => ciclos >= 6,
    });
    // Tres ciclos no dia 24 (um pedido) e tres no dia 25 (um pedido): dois executados, nunca quatro.
    expect(executados).toEqual(["2026-09-24", "2026-09-25"]);
  });
});
