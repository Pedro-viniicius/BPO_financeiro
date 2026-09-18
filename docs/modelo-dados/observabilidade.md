# Observabilidade do Banco de Dados

> O que MEDIR em producao. Nada aqui e otimizacao antecipada: sao consultas
> de diagnostico e limiares que disparam investigacao. Complementa
> `docs/arquitetura/visao-geral.md` (logs da aplicacao).

## O que acompanhar

| Sinal | Como medir | Limiar para investigar |
|---|---|---|
| Consultas lentas | `log_min_duration_statement = 500ms` no PostgreSQL; `pg_stat_statements` | qualquer consulta de tela acima de 500 ms |
| Travamentos (locks) | `pg_locks` + `pg_stat_activity` com `wait_event_type = 'Lock'` | espera > 5 s, ou qualquer deadlock |
| Conexoes | `SELECT count(*) FROM pg_stat_activity` | acima de 70% de `max_connections` |
| Crescimento de tabelas | `pg_total_relation_size` por tabela, semanal | `eventos_auditoria` > 20 GB (ADR-019); qualquer tabela dobrando em um mes |
| Linhas mortas (dead tuples) | `pg_stat_user_tables.n_dead_tup` | > 20% das linhas vivas (autovacuum atrasado) |
| Uso de indices | `pg_stat_user_indexes.idx_scan` | indice com 0 leituras apos 90 dias: candidato a remocao |
| Varreduras completas | `pg_stat_user_tables.seq_scan` em tabelas grandes | `seq_scan` crescendo em `parcelas_*`, `movimentacoes_bancarias` |
| Duracao das migracoes | tempo do passo `pnpm banco:migrar` | acima de 60 s: planejar janela e estrategia compativel |
| Fila de tarefas | `SELECT estado, count(*) FROM tarefas GROUP BY 1` | `pendente` crescendo continuamente; qualquer `falhou` |
| Outbox | `SELECT count(*) FROM eventos_saida WHERE publicado_em IS NULL` | > 100 por mais de 5 minutos |
| Divergencia de derivados | consulta em `concorrencia.md` | qualquer linha (e bug, nao dado) |
| Backup | idade do arquivo mais recente em `./backups` | > 26 h |
| Restauracao testada | registro em `docs/operacao/registro-restauracoes.md` | > 35 dias sem teste |

## Consultas prontas

```sql
-- 10 maiores tabelas com contagem estimada de linhas
SELECT relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho,
       n_live_tup AS linhas_vivas, n_dead_tup AS linhas_mortas
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;

-- quem esta esperando lock, e por causa de quem
SELECT bloqueada.pid AS pid_bloqueado, bloqueada.query AS consulta_bloqueada,
       bloqueadora.pid AS pid_bloqueador, bloqueadora.query AS consulta_bloqueadora
FROM pg_stat_activity bloqueada
JOIN pg_stat_activity bloqueadora ON bloqueadora.pid = ANY(pg_blocking_pids(bloqueada.pid))
WHERE cardinality(pg_blocking_pids(bloqueada.pid)) > 0;

-- indices sem uso
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;

-- consultas mais caras (exige a extensao)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  (requer shared_preload_libraries)
SELECT calls, round(mean_exec_time::numeric, 1) AS media_ms, round(total_exec_time::numeric) AS total_ms, query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- saude da fila e da outbox
SELECT estado, count(*) FROM tarefas GROUP BY estado;
SELECT count(*) FILTER (WHERE publicado_em IS NULL) AS pendentes,
       max(tentativas) AS maior_numero_tentativas FROM eventos_saida;
```

## Configuracao recomendada (Modelos A/B/C)

```conf
# postgresql.conf — valores iniciais para servidor pequeno (4 GB de RAM)
log_min_duration_statement = 500ms   # registra consultas lentas
log_lock_waits = on                  # registra esperas longas por lock
log_checkpoints = on
track_io_timing = on                 # necessario para EXPLAIN (BUFFERS) util
shared_buffers = 1GB
work_mem = 16MB
maintenance_work_mem = 256MB
```
Ajustar com medicao, nao por suposicao.

## Antes de otimizar

1. Reproduza a lentidao e rode `EXPLAIN (ANALYZE, BUFFERS)`.
2. Veja se um indice existente deveria ter sido usado (estatisticas velhas? `ANALYZE`).
3. Considere reescrever a consulta antes de criar indice novo.
4. Se criar indice, registre em `indices.md`: consulta, motivo, custo.
5. Particionamento, views materializadas e tabelas de leitura so com numeros
   que provem a necessidade (ADR-019 define o limiar da auditoria).

## Onde isso aparece para o usuario

Status de importacoes e integracoes (Gate 10) le `tarefas` e `eventos_saida`.
Erros tecnicos nunca vazam para a tela: o usuario ve "Nao foi possivel
importar o extrato. Nenhum lancamento foi alterado."
