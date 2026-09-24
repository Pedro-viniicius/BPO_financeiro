import type { DataCivil } from "@/compartilhado/datas/indice";

import type { FilaTarefas, ManipuladorTarefa, PedidoTarefa } from "../dominio/tarefa";
import { ExecutorTarefas } from "./executor-tarefas";

export interface RegistradorDoLaco {
  info(mensagem: string, dados?: Record<string, unknown>): void;
  erro(mensagem: string, dados?: Record<string, unknown>): void;
}

export interface OpcoesDoLaco {
  readonly fila: FilaTarefas;
  readonly manipuladores: readonly ManipuladorTarefa[];
  /** Passo executado antes das tarefas em cada ciclo (ex.: entregar eventos de saida). */
  readonly antesDoCiclo?: () => Promise<void>;
  /**
   * Pedidos que devem existir UMA vez por dia (retencao, limpezas). Sao
   * enfileirados quando o dia muda, com chave de idempotencia — a fila
   * recusa o segundo, mesmo que o processo reinicie.
   */
  readonly pedidosDiarios?: (hoje: DataCivil) => readonly PedidoTarefa[];
  readonly hoje: () => DataCivil;
  readonly intervaloMs: number;
  readonly logs: RegistradorDoLaco;
  /** Sinal de encerramento (SIGTERM). */
  readonly encerrando: () => boolean;
}

/**
 * O laco do executor, sem efeitos colaterais na importacao: quem monta as
 * dependencias (composicao) chama esta funcao. O nucleo nao conhece nenhum
 * modulo — os manipuladores chegam prontos.
 */
export async function rodarLacoDoExecutor(opcoes: OpcoesDoLaco): Promise<void> {
  const executor = new ExecutorTarefas(opcoes.fila, opcoes.logs);
  for (const manipulador of opcoes.manipuladores) executor.registrar(manipulador);
  opcoes.logs.info("executor de tarefas iniciado", { intervaloMs: opcoes.intervaloMs, tipos: executor.tiposRegistrados() });

  let diaDosPedidos: DataCivil | null = null;
  const dormir = () => new Promise((resolver) => setTimeout(resolver, opcoes.intervaloMs));

  while (!opcoes.encerrando()) {
    try {
      const hoje = opcoes.hoje();
      if (opcoes.pedidosDiarios && diaDosPedidos !== hoje) {
        for (const pedido of opcoes.pedidosDiarios(hoje)) {
          const id = await opcoes.fila.enfileirar(pedido);
          if (id) opcoes.logs.info("pedido diario enfileirado", { tipo: pedido.tipo, dia: hoje });
        }
        diaDosPedidos = hoje;
      }
      await opcoes.antesDoCiclo?.();
      const executadas = await executor.executarAteEsvaziar();
      if (executadas === 0) await dormir();
    } catch (erro) {
      opcoes.logs.erro("falha no ciclo do executor", { erro: erro instanceof Error ? erro.message : String(erro) });
      await dormir();
    }
  }
}
