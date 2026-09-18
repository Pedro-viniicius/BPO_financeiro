# ADR-001 — Monolito modular

**Status:** Aceita · 2026-09-18

## Contexto

O produto precisa ser instalado na infraestrutura do cliente (licenca perpetua,
modelos de deploy B e C), mantido por uma equipe pequena e evoluir rapido nos
primeiros anos. Ao mesmo tempo, o dominio tem areas bem distintas (operacao
financeira, tesouraria, controle gerencial, integracoes, IA) que podem, um dia,
precisar de escala ou cadencia de entrega diferentes.

## Decisao

Construir um **monolito modular**: uma unica aplicacao implantavel (um processo
web + um processo de tarefas), com o codigo dividido em modulos de negocio
(`src/modulos/*`), servicos de plataforma (`src/nucleo/*`) e integracoes
(`src/integracoes/*`). Cada modulo tem fronteira explicita (`publico.ts`) e as
fronteiras sao verificadas por ferramenta (ADR-014).

Nao usar microsservicos, filas externas (Kafka, RabbitMQ), Redis ou Kubernetes
ate que exista necessidade comprovada.

## Alternativas consideradas

- **Microsservicos desde o inicio** — rejeitada: exigiria orquestracao,
  observabilidade distribuida e rede entre servicos que o cliente que hospeda
  em um servidor local nao consegue operar; multiplicaria custos sem beneficio
  para o tamanho atual.
- **Monolito sem fronteiras** (pastas tecnicas: controllers/services/models) —
  rejeitada: vira uma "bola de lama" em poucos meses e impede extrair modulos
  depois.

## Consequencias positivas

- Um `docker compose up` sobe tudo. Depuracao local simples.
- Transacoes de banco atravessam modulos quando necessario (ex.: pagamento +
  movimentacao + auditoria + outbox na mesma transacao).
- A extracao futura de um modulo (IA, integracao bancaria, importacao) e
  possivel porque ele ja so conversa pelo `publico.ts` e por eventos.

## Consequencias negativas

- Um erro grave em um modulo pode derrubar o processo inteiro (mitigado por
  processo de tarefas separado e limites de recursos).
- Disciplina de fronteira depende de lint; sem ele, o acoplamento cresce.

## Riscos

- Equipe "pular a cerca" para resolver rapido. Mitigacao: CI falha em violacao.

## Criterios para revisao futura

Extrair um modulo para servico proprio apenas com evidencia concreta:
necessidade de escala independente, cadencia de deploy diferente, equipe
propria, processamento pesado, isolamento de seguranca ou complexidade de
integracao (ver Gate 1, secao 47).
