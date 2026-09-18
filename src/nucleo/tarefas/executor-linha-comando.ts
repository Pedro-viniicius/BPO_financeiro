import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { EntregadorEventosSaida } from "@/nucleo/eventos/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { ExecutorTarefas } from "./aplicacao/executor-tarefas";
import { FilaTarefasPostgres } from "./infraestrutura/fila-tarefas-postgres";

/**
 * Processo de tarefas em segundo plano.
 *
 * Uso: `pnpm tarefas:executar`
 *
 * Roda como um processo separado da aplicacao web (no Docker, um servico
 * `tarefas`). Em loop: entrega eventos de saida pendentes e executa tarefas.
 * Cada modulo registra seus manipuladores aqui conforme for implementado.
 */
async function iniciar(): Promise<void> {
  const variaveis = obterVariaveisAmbiente();
  const logs = criarRegistradorLogs("tarefas");
  const banco = obterBancoDados();

  const entregador = new EntregadorEventosSaida(banco);
  const executor = new ExecutorTarefas(new FilaTarefasPostgres(banco), logs);

  // Manipuladores de eventos e de tarefas dos modulos serao registrados aqui
  // a partir do Gate 6 (ex.: executor.registrar(manipuladorImportacaoOfx)).

  logs.info("executor de tarefas iniciado", { intervaloMs: variaveis.TAREFAS_INTERVALO_MS, tipos: executor.tiposRegistrados() });

  let encerrando = false;
  const encerrar = () => {
    encerrando = true;
    logs.info("encerrando executor de tarefas");
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);

  while (!encerrando) {
    try {
      await entregador.entregarPendentes();
      const executadas = await executor.executarAteEsvaziar();
      if (executadas === 0) {
        await new Promise((resolver) => setTimeout(resolver, variaveis.TAREFAS_INTERVALO_MS));
      }
    } catch (erro) {
      logs.erro("falha no ciclo do executor", { erro: erro instanceof Error ? erro.message : String(erro) });
      await new Promise((resolver) => setTimeout(resolver, variaveis.TAREFAS_INTERVALO_MS));
    }
  }
  process.exit(0);
}

iniciar().catch((erro: unknown) => {
  console.error("Executor de tarefas encerrado com erro:", erro);
  process.exit(1);
});
