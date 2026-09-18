# Registros de Decisao de Arquitetura (ADR)

ADR = *Architecture Decision Record*: um documento curto que registra UMA
decisao importante, por que foi tomada, o que foi descartado e quando deve
ser revista. Serve para que ninguem precise "adivinhar" o motivo de uma
escolha meses depois.

| ADR | Titulo | Status |
|---|---|---|
| [001](ADR-001-monolito-modular.md) | Monolito modular | Aceita |
| [002](ADR-002-nextjs-typescript.md) | Next.js + TypeScript | Aceita |
| [003](ADR-003-postgresql.md) | PostgreSQL como banco unico | Aceita |
| [004](ADR-004-drizzle.md) | Drizzle ORM com contratos de repositorio | Aceita |
| [005](ADR-005-single-tenant.md) | Single-tenant por instalacao, multiempresa internamente | Aceita |
| [006](ADR-006-autenticacao.md) | Better Auth para autenticacao | Aceita |
| [007](ADR-007-autorizacao.md) | Permissoes granulares, negar por padrao | Aceita |
| [008](ADR-008-auditoria.md) | Auditoria financeira somente insercao | Aceita |
| [009](ADR-009-modelos-deploy.md) | Modelos de deploy A/B/C com o mesmo codigo | Aceita |
| [010](ADR-010-inteligencia-artificial.md) | IA somente leitura, por gateway | Aceita |
| [011](ADR-011-integracoes.md) | Integracoes por portas e adaptadores | Aceita |
| [012](ADR-012-tarefas-assincronas.md) | Tarefas e outbox no PostgreSQL | Aceita |
| [013](ADR-013-licenciamento.md) | Licenciamento fora do dominio, via portao de recursos | Aceita |
| [014](ADR-014-limites-dependencias.md) | Limites de dependencia verificados por lint | Aceita |
| [015](ADR-015-representacao-monetaria.md) | Dinheiro em centavos inteiros (BigInt) + NUMERIC | Aceita |
| [016](ADR-016-nomes-em-portugues.md) | Vocabulario em portugues no codigo | Aceita |
| [017](ADR-017-seguranca-por-linha.md) | Seguranca por linha (RLS): avaliada, nao adotada agora | Aceita |
| [018](ADR-018-titulos-pagar-receber-separados.md) | Contas a pagar e a receber em estruturas separadas | Aceita |
| [019](ADR-019-auditoria-particionamento-retencao.md) | Auditoria: sem particionamento agora, com limiar definido | Aceita |
| [020](ADR-020-sistema-de-interface-proprio.md) | Sistema de interface proprio: CSS Modules + tokens, sem biblioteca | Aceita |
| [021](ADR-021-navegacao-lateral.md) | Navegacao lateral por tarefas, em grupos rotulados | Aceita |
| [022](ADR-022-pagina-gaveta-dialogo.md) | Onde uma acao abre: pagina, gaveta ou dialogo | Aceita |
| [023](ADR-023-conciliacao-duas-colunas.md) | Conciliacao em duas colunas pareadas, so no desktop | Aceita |
| [024](ADR-024-camada-apresentacao.md) | Camada de apresentacao: a interface nao decide regra financeira | Aceita |
| [025](ADR-025-contexto-organizacional.md) | Contexto organizacional autenticado e empresa ativa | Aceita |

Status possiveis: Proposta, Aceita, Substituida (por outra ADR), Rejeitada.
