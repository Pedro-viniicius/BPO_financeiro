# ADR-003 — PostgreSQL como banco unico

**Status:** Aceita · 2026-09-18

## Contexto

Dados financeiros exigem transacoes, integridade referencial, tipos decimais
exatos e auditoria. O produto precisa rodar em qualquer provedor (nuvem
gerida, VPS, servidor local) sem reescrita.

## Decisao

- **PostgreSQL (versao 16 ou superior; 17 na imagem Docker padrao)** e a
  dependencia arquitetural. Nenhum provedor especifico (Neon, Supabase, RDS,
  Railway) e: usamos apenas SQL padrao e recursos do PostgreSQL comunitario.
- Usar o PostgreSQL tambem para **fila de tarefas e outbox** (ADR-012),
  evitando Redis/RabbitMQ.
- Dinheiro em `NUMERIC(15,2)` (ADR-015); datas de negocio em `DATE`;
  instantes tecnicos em `TIMESTAMPTZ` (UTC).
- Migracoes versionadas em `src/banco-dados/migracoes/`, aplicadas por
  `pnpm banco:migrar`. Nunca alteracao manual em producao.
- Quatro usuarios de banco com menor privilegio: aplicacao, migracao, backup,
  administrador (ver `docs/arquitetura/banco-dados.md`).
- Isolamento por empresa feito na aplicacao (todo repositorio filtra por
  `empresa_id`). *Row Level Security* (RLS) fica como reforco opcional para o
  Gate 5, avaliado apos medir impacto.

## Alternativas consideradas

- **MySQL/MariaDB** — funcional, mas sem `SKIP LOCKED` tao maduro, sem
  `jsonb` equivalente e com menos recursos para auditoria.
- **SQLite** — atraente para servidor local, mas fraco para varios processos
  (web + tarefas) e sem usuarios distintos.
- **Banco gerido com extensoes proprietarias** — rejeitado: prende a um provedor.

## Consequencias positivas

- Portabilidade total entre modelos A/B/C.
- Menos pecas de infraestrutura para o cliente operar.

## Consequencias negativas

- Fila no banco tem limite de vazao (milhares de tarefas/min, nao milhoes).
  Suficiente por anos para o publico-alvo.

## Riscos

- Cliente instalar versao antiga do PostgreSQL. Mitigacao: verificacao de
  versao na inicializacao (Gate 5) e imagem Docker fixada.

## Criterios para revisao futura

Introduzir outra tecnologia de fila ou cache apenas com medicao mostrando
gargalo real no PostgreSQL.
