# ADR-004 — Drizzle ORM com contratos de repositorio

**Status:** Aceita · 2026-09-18

## Contexto

Precisamos de acesso tipado ao PostgreSQL, migracoes versionadas e controle
fino do SQL (consultas financeiras com somas, janelas e `FOR UPDATE SKIP
LOCKED`), sem que o dominio conheca o ORM.

## Decisao

Usar **Drizzle ORM 0.45 + drizzle-kit** para:
- definir esquemas em TypeScript (`<modulo>/infraestrutura/esquema.ts`);
- gerar migracoes SQL (`pnpm banco:gerar`) e aplica-las (`pnpm banco:migrar`);
- implementar repositorios (`Repositorio...Drizzle`).

O dominio e a aplicacao dependem apenas de **contratos de repositorio**
(interfaces em `aplicacao/`), exemplo em
`src/modulos/contas-pagar/aplicacao/repositorio-contas-pagar.ts`. A
implementacao Drizzle e injetada na composicao. Testes de caso de uso usam
implementacoes em memoria.

Configuracao: `casing: "snake_case"` (colunas `criado_em`, propriedades
`criadoEm`), driver `postgres` (postgres-js), valores `NUMERIC` lidos como
texto e convertidos em `Dinheiro` (nunca `number`).

Avaliacao feita:

| Criterio | Drizzle | Prisma | Kysely |
|---|---|---|---|
| SQL explicito e controlavel | sim | limitado | sim |
| Migracoes SQL versionadas e legiveis | sim | sim (proprio formato) | manual |
| Tipagem forte sem geracao de cliente | sim | exige geracao | sim |
| Peso em tempo de execucao | leve | motor extra | leve |
| Compatibilidade com Better Auth | adaptador oficial | adaptador oficial | adaptador oficial |
| Curva de aprendizado para quem sabe SQL | baixa | media | baixa |

Kysely foi o segundo colocado (Drizzle usa Kysely internamente em partes);
Drizzle vence por ter esquema declarativo + migracoes integradas.

## Alternativas consideradas

- **Prisma** — rejeitado pelo motor de consulta separado e SQL menos
  transparente para consultas financeiras.
- **SQL puro sem ORM** — rejeitado: perde tipagem nas colunas e migracoes
  exigiriam ferramenta a parte.

## Consequencias positivas

- Consultas complexas podem cair para SQL (`sql\`...\``) sem sair do Drizzle.
- Migracoes sao arquivos SQL que qualquer DBA le.

## Consequencias negativas

- Drizzle ainda e < 1.0: mudancas de API entre versoes. Versao fixada no
  `package.json`.
- O migrador exige `CREATE` no banco para o usuario de migracao (executa
  `CREATE SCHEMA IF NOT EXISTS`).

## Riscos

- Vazamento de tipos do Drizzle para o dominio. Mitigacao: regra de lint
  `dominio-nao-conhece-frameworks`.

## Criterios para revisao futura

Revisar ao lancamento do Drizzle 1.0 ou se a geracao de migracoes se mostrar
inadequada para alteracoes de dados (migracoes personalizadas ja sao suportadas).
