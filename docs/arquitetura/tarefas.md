# Tarefas em Segundo Plano e Eventos

> Gate 2 · ADR-012. Codigo em `src/nucleo/tarefas/` e `src/nucleo/eventos/`.

## Vocabulario

- **Tarefa**: trabalho que roda fora da requisicao HTTP (importar OFX, gerar
  relatorio, recalcular previsao, enviar e-mail).
- **Fila**: onde as tarefas esperam. Aqui, a tabela `tarefas` no PostgreSQL.
- **Executor**: processo que pega tarefas da fila e roda o manipulador certo.
- **Manipulador** (handler): funcao que sabe executar um tipo de tarefa.
- **Evento de dominio**: aviso de que algo aconteceu ("pagamento registrado").
- **Outbox** (caixa de saida): tabela `eventos_saida` onde o evento e gravado
  na MESMA transacao da operacao, para nunca se perder.
- **Idempotencia**: executar duas vezes da o mesmo resultado que uma. Necessario
  porque a entrega e "ao menos uma vez".

## Fluxo de uma tarefa

```
caso de uso ──enfileirar({ tipo, dados, chaveIdempotencia })──▶ tabela tarefas (pendente)
                                                                      │
processo tarefas ── reservarProxima() [FOR UPDATE SKIP LOCKED] ───────┘
      │  estado = executando, tentativas + 1
      ▼
manipulador.executar(tarefa)
      │ ok → marcarConcluida
      │ erro → marcarFalha: reagenda com atraso (5s, 25s, 2min, 10min, 50min)
      │        ou estado = falhou ao esgotar maximo_tentativas
```

`SKIP LOCKED` faz com que varios executores (varias replicas do servico
`tarefas`) nunca peguem a mesma linha.

## Fluxo de um evento (outbox)

```
executarEmTransacao(async (transacao) => {
  await repositorio.salvar(conta);                 // dado
  await auditoria.registrar({...});                // auditoria
  await publicador.publicar({ nome: "conta_pagar.pagamento_registrado", dados }); // outbox
});   ← tudo ou nada

processo tarefas, a cada ciclo:
  entregador.entregarPendentes()
    para cada evento nao publicado: chama manipuladores registrados pelo nome
    sucesso → publicado_em = agora
    falha   → tentativas + 1, ultimo_erro; desiste apos 10
```

## Contratos (o que os modulos usam)

```ts
interface FilaTarefas {
  enfileirar(pedido): Promise<string | null>;   // null = chave de idempotencia ja existe
  reservarProxima(tipos?): Promise<Tarefa | null>;
  marcarConcluida(id): Promise<void>;
  marcarFalha(id, erro, reagendarEmMs): Promise<void>;
}
interface PublicadorEventos { publicar(evento): Promise<void>; }
interface ManipuladorTarefa { tipo: string; executar(tarefa): Promise<void>; }
interface ManipuladorEvento { nomeEvento: string; tratar(evento): Promise<void>; }
```

Implementacoes: `FilaTarefasPostgres`, `PublicadorEventosSaida` (producao);
`FilaTarefasEmMemoria`, `PublicadorEventosEmMemoria` (testes).

## Como registrar um manipulador

Em `src/composicao/tarefas.ts` (o laco generico esta em `nucleo/tarefas/aplicacao/laco-do-executor.ts`; o nucleo nao conhece modulos, entao os manipuladores sao montados na composicao):

```ts
executor.registrar(manipuladorImportacaoOfx);        // tarefa
entregador.registrar(criarMovimentacaoAoPagar);       // evento
```

A partir do Gate 6 esse registro sera feito por uma funcao de composicao por
modulo (`src/composicao/tarefas.ts`), para o arquivo nao crescer.

## Nomes

- Tipos de tarefa: `"<modulo>.<verbo_infinitivo>"` → `importacao.processar_ofx`,
  `previsao.recalcular`, `eventos.publicar_saida`.
- Nomes de evento: `"<modulo>.<fato_no_participio>"` → `conta_pagar.pagamento_registrado`,
  `extrato.importado`.

## Operacao

- Processo: `pnpm tarefas:executar` (servico `tarefas` no compose). Encerra
  com `SIGTERM`/`SIGINT` apos terminar a tarefa atual.
- Intervalo de varredura: `TAREFAS_INTERVALO_MS` (padrao 2000).
- Monitorar: `SELECT estado, count(*) FROM tarefas GROUP BY 1;` e
  `SELECT count(*) FROM eventos_saida WHERE publicado_em IS NULL;` — a tela
  de "status de importacoes/integracoes" (Gate 10) lera estas tabelas.
- Limpeza: tarefa periodica apagara `concluida` com mais de 30 dias (Gate 5).

## Trocar a infraestrutura no futuro

Implementar `FilaTarefas` sobre outra tecnologia e trocar em `composicao/`.
Os casos de uso, o executor e os testes nao mudam. Fazer isso apenas com
medicao de gargalo (ADR-012).
