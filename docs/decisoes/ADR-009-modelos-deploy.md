# ADR-009 — Modelos de deploy A/B/C com o mesmo codigo

**Status:** Aceita · 2026-09-18

## Contexto

Licenca perpetua + tres formas de hospedar: gerida pelo fornecedor (A), nuvem
do cliente (B), servidor local do cliente (C, "on-premises"). O fornecedor nao
pode ficar obrigado a pagar infraestrutura para sempre apos uma venda unica.

## Decisao

**Um unico codigo-fonte** e uma unica imagem Docker para os tres modelos. O que
muda e apenas configuracao (variaveis de ambiente), licenca (portao de
recursos) e adaptadores contratados.

| Modelo | Quem opera | Como roda | Publico |
|---|---|---|---|
| A — Hospedagem gerida | fornecedor (servico contratado a parte) | plataforma/proxy + aplicacao + PostgreSQL dedicado por cliente | pequenas empresas |
| B — Nuvem do cliente | cliente | `docker-compose.yml` em VPS/nuvem do cliente | empresas com TI ou BPO |
| C — Servidor local | cliente | mesmo compose em servidor na rede local; internet controlada | quem exige dados internos |

Entregaveis ja criados: `Dockerfile` (multi-etapa, usuario nao-root,
healthcheck), `docker-compose.yml` (banco, migracao, aplicacao, tarefas,
backup), `.env.exemplo`, `scripts/backup.sh`, `scripts/restaurar.sh`,
`scripts/banco/10-criar-usuarios.sh` (antes `criar-usuarios.sql`; as senhas passaram a vir do ambiente). Detalhes em
`docs/arquitetura/modelos-deploy.md`.

Proibido: pastas ou ramos por cliente. Comportamento por cliente vem de
configuracao, portao de recursos, adaptadores e permissoes.

## Alternativas consideradas

- **Somente SaaS multi-tenant** — rejeitado (ADR-005 e modelo comercial).
- **Instalador nativo (sem Docker)** — adiado: Docker cobre B e C com muito
  menos suporte; instalador pode vir depois para C se houver demanda.

## Consequencias positivas

- Um bug corrigido vale para todos os modelos.
- Cliente do Modelo B/C pode migrar para A (ou vice-versa) restaurando o backup.

## Consequencias negativas

- Modelo C sem internet nao recebe atualizacoes automaticas nem IA externa;
  precisa de procedimento de atualizacao offline (imagem Docker exportada).

## Riscos

- Cliente sem TI operando B/C mal. Mitigacao: documentacao passo a passo,
  healthcheck, backup automatico com teste de restauracao; oferta de
  suporte contratado.

## Criterios para revisao futura

Automatizar o Modelo A (criacao de instancia por cliente) quando houver mais
de ~10 clientes hospedados.
