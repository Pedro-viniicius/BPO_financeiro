# ADR-002 — Next.js + TypeScript

**Status:** Aceita · 2026-09-18

## Contexto

Aplicacao web com telas ricas (lancamento rapido, conciliacao, dashboards),
API interna e necessidade de rodar tanto em plataforma gerida quanto em Docker
no servidor do cliente. Equipe pequena: um unico idioma e um unico repositorio
reduzem custo.

## Decisao

- **Next.js 16 (App Router)** como framework web: interface (React 19) e
  camada HTTP (route handlers e server actions) no mesmo projeto.
- **TypeScript 5.9 em modo estrito** (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`) em todo o codigo, incluindo dominio.
- **Zod 4** para validar tudo que entra (formularios, APIs, importacoes,
  variaveis de ambiente).
- `output: "standalone"` para gerar a imagem Docker enxuta.
- TypeScript 7 (reescrita em Go) e ESLint 10 nao adotados ainda: `eslint-config-next`
  ainda pede ESLint 9 e o ecossistema de plugins precisa amadurecer. Revisar em 6 meses.

## Alternativas consideradas

- **Backend separado (NestJS/Fastify) + SPA** — rejeitada: dois projetos, dois
  deploys, duplicacao de tipos e validacao; sem ganho para o tamanho atual.
- **Remix/SvelteKit** — viaveis, mas Next.js tem maior base de conhecimento
  no mercado brasileiro e integracao direta com Better Auth e Drizzle.

## Consequencias positivas

- Tipos compartilhados entre servidor e interface.
- Server components reduzem JavaScript enviado ao navegador.
- Deploy identico em A/B/C (ADR-009).

## Consequencias negativas

- Next.js evolui rapido; atualizacoes maiores exigem atencao.
- Server actions precisam da mesma autorizacao das rotas (nao ha "porta dos
  fundos"): toda action passa pela politica central (ADR-007).

## Riscos

- Acoplar regras de negocio a componentes React. Mitigacao: dominio e
  aplicacao nao podem importar `next`/`react` (regra de lint).

## Criterios para revisao futura

Se a interface precisar de aplicativo nativo ou cliente desktop, avaliar
extrair a API para um servico proprio mantendo o dominio intacto.
