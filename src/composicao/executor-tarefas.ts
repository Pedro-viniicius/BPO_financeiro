import { iniciarExecutorDeTarefas } from "./tarefas";

/** Ponto de entrada do servico `tarefas`. A composicao esta em `tarefas.ts`. */
iniciarExecutorDeTarefas()
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error("Executor de tarefas encerrado com erro:", erro);
    process.exit(1);
  });
