# ADR-012 — Tarefas em segundo plano e outbox no PostgreSQL

**Status:** Aceita · 2026-09-18

## Contexto

Importar OFX, recalcular previsoes, gerar relatorios, enviar e-mails e
entregar eventos entre modulos nao podem rodar dentro da requisicao HTTP.
Precisamos de fila com retentativas e de garantia de que um evento importante
("pagamento registrado") nao se perca entre a transacao e a integracao.

## Decisao

**Fila de tarefas no PostgreSQL** (`src/nucleo/tarefas/`):
- tabela `tarefas` (tipo, dados, estado, agendada_para, tentativas, chave de
  idempotencia unica);
- `FilaTarefasPostgres.reservarProxima` usa `SELECT ... FOR UPDATE SKIP LOCKED`
  (varios executores sem duplicar trabalho);
- `ExecutorTarefas` depende do contrato `FilaTarefas` (trocavel), registra
  manipuladores por tipo, aplica atraso crescente (5s, 25s, 2min, 10min, 50min)
  e marca `falhou` ao esgotar tentativas;
- processo separado: `pnpm tarefas:executar` (servico `tarefas` no compose).

**Outbox transacional** (`src/nucleo/eventos/`; "caixa de saida": tabela onde o
evento e gravado na mesma transacao da operacao para nunca se perder):
- `PublicadorEventosSaida` recebe a transacao em andamento e insere em
  `eventos_saida`;
- `EntregadorEventosSaida` (rodando no processo de tarefas) entrega aos
  manipuladores registrados e marca `publicado_em`; falhas ficam com
  `ultimo_erro` e tentativas, ate 10;
- garantia **ao menos uma vez**: manipuladores devem ser idempotentes.

Ambos testados contra PostgreSQL real no Gate 2 (5 testes de integracao,
executados quando `BANCO_URL_TESTE` esta definida).

## Alternativas consideradas

- **Redis + BullMQ** — rejeitado agora: mais uma peca para o cliente operar;
  vazao desnecessaria para o publico-alvo.
- **RabbitMQ/Kafka** — idem, com custo operacional ainda maior.
- **Publicar evento direto apos o commit (sem outbox)** — rejeitado: se o
  processo cair entre o commit e a publicacao, o evento some.
- **`LISTEN/NOTIFY`** — pode complementar (acordar o executor), mas nao
  substitui a tabela (nao persiste).

## Consequencias positivas

- Zero infraestrutura extra. Backup do banco inclui a fila.
- Idempotencia por chave evita importar o mesmo arquivo duas vezes.

## Consequencias negativas

- Varredura periodica (2s por padrao) em vez de entrega instantanea.
- Tarefas muito longas seguram uma conexao; dividir em etapas.

## Riscos

- Tabela `tarefas` crescer sem limpeza. Mitigacao: tarefa de manutencao que
  apaga concluidas com mais de N dias (Gate 5).

## Criterios para revisao futura

Trocar a implementacao de `FilaTarefas` por outra infraestrutura somente
com medicao de gargalo (> milhares de tarefas/min) ou necessidade de
entrega em tempo real.
