import { hojeDataCivil } from "@/compartilhado/datas/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { EntregadorEventosSaida } from "@/nucleo/eventos/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";
import { FilaTarefasPostgres, rodarLacoDoExecutor, type ManipuladorTarefa } from "@/nucleo/tarefas/publico";
import { manipuladorDeRetencao, pedidoDeRetencaoDiaria, RepositorioCapturaDrizzle } from "@/modulos/captura-documentos/publico";

import { montarArmazenamentoArquivos } from "./arquivos";

/**
 * Processo de tarefas em segundo plano (servico `tarefas` no Compose).
 *
 * Uso: `pnpm tarefas:executar`
 *
 * E a COMPOSICAO que liga os modulos ao executor: o nucleo nao pode conhecer
 * modulo nenhum (regra `nucleo-nao-importa-modulos`), entao os manipuladores
 * sao montados aqui e entregues prontos ao laco. Cada modulo com tarefa
 * registra a sua nesta lista.
 */
export function montarManipuladores(): readonly ManipuladorTarefa[] {
  const banco = obterBancoDados();
  const logs = criarRegistradorLogs("tarefas.captura");
  return [
    manipuladorDeRetencao({
      repositorio: new RepositorioCapturaDrizzle(banco),
      armazenamentoDe: montarArmazenamentoArquivos,
      registrar: (mensagem, dados) => logs.info(mensagem, dados),
    }),
  ];
}

export async function iniciarExecutorDeTarefas(): Promise<void> {
  const variaveis = obterVariaveisAmbiente();
  const logs = criarRegistradorLogs("tarefas");
  const banco = obterBancoDados();
  const entregador = new EntregadorEventosSaida(banco);

  let encerrando = false;
  const encerrar = () => {
    encerrando = true;
    logs.info("encerrando executor de tarefas");
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);

  await rodarLacoDoExecutor({
    fila: new FilaTarefasPostgres(banco),
    manipuladores: montarManipuladores(),
    antesDoCiclo: async () => {
      await entregador.entregarPendentes();
    },
    pedidosDiarios: (hoje) => [pedidoDeRetencaoDiaria(hoje)],
    hoje: () => hojeDataCivil("America/Sao_Paulo"),
    intervaloMs: variaveis.TAREFAS_INTERVALO_MS,
    logs,
    encerrando: () => encerrando,
  });
}
