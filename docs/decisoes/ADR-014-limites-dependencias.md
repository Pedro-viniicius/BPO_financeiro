# ADR-014 — Limites de dependencia verificados por lint

**Status:** Aceita · 2026-09-18

## Contexto

Fronteiras de modulo que vivem so em documentos sao ignoradas em semanas.
Precisamos que a CI falhe quando alguem importa a infraestrutura de outro
modulo, usa Drizzle no dominio ou chama um SDK de IA de dentro de um modulo
financeiro.

## Decisao

**dependency-cruiser** com regras em `.dependency-cruiser.cjs`, executado por
`pnpm verificar:arquitetura` (falha em qualquer violacao) e pela CI. ESLint
cuida de qualidade de codigo; nao duplica regras de fronteira.

Regras (nomes em portugues, cada uma com comentario explicativo):

| Regra | Impede |
|---|---|
| `sem-dependencias-circulares` | ciclos de importacao |
| `dominio-nao-conhece-frameworks` | `dominio/` e `aplicacao/` importarem next, react, drizzle, better-auth, postgres |
| `frameworks-so-em-camadas-tecnicas` | frameworks fora de infraestrutura/, interface/, app/, composicao/, banco-dados/ |
| `dominio-nao-importa-camadas-superiores` | dominio → aplicacao/infraestrutura/interface |
| `aplicacao-nao-importa-infraestrutura` | aplicacao → infraestrutura/interface |
| `modulos-so-se-conhecem-pelo-publico` | modulo A → arquivos internos do modulo B |
| `nucleo-so-se-conhece-pelo-publico` | idem dentro de nucleo (excecao: esquemas ↔ esquemas) |
| `integracoes-so-se-conhecem-pelo-publico` | idem dentro de integracoes |
| `modulos-importam-nucleo-so-pelo-publico` | modulos/app → internos do nucleo |
| `modulos-importam-integracoes-so-pelo-publico` | modulos/nucleo/app → internos de integracoes |
| `provedores-externos-so-na-composicao` | qualquer coisa fora de composicao/ → provedores/ |
| `sdks-de-ia-so-em-provedores` | SDKs de IA fora de integracoes/inteligencia-artificial/provedores |
| `sdks-bancarios-so-em-provedores` | SDKs bancarios fora de integracoes/bancarias/provedores |
| `nucleo-nao-importa-modulos` | nucleo → modulos |
| `integracoes-nao-importam-modulos` | integracoes → modulos |
| `compartilhado-nao-importa-nada-interno` | compartilhado → qualquer pasta interna |
| `app-nao-importa-infraestrutura` | app → dominio/aplicacao/infraestrutura ou banco-dados |
| `banco-dados-so-agrega-esquemas` | banco-dados → qualquer coisa que nao seja esquema |
| `sem-dependencias-orfas-em-modulos` (aviso) | arquivos sem uso |

Validacao feita no Gate 2: arquivos propositalmente errados dispararam 5
violacoes distintas; removidos, o comando volta a passar com 0.

Nomes de script em portugues (`verificar:arquitetura`, `verificar:tipos`,
`testar`) funcionam sem problema no pnpm; mantivemos `lint`, `build` e `dev`
por serem convencoes que ferramentas externas (Vercel, editores) procuram.

## Alternativas consideradas

- **eslint-plugin-boundaries** — viavel; dependency-cruiser tem melhor
  suporte a grupos capturados (`$1`) e relatorio grafico.
- **Nx/monorepo com pacotes por modulo** — rejeitado: peso de ferramenta
  para uma equipe pequena; pode ser adotado depois sem mudar as regras.

## Consequencias positivas

- A arquitetura e executavel: quem violar recebe a explicacao na hora.
- `pnpm verificar:arquitetura:grafico` gera o grafo para documentacao.

## Consequencias negativas

- Regras precisam de manutencao quando surgem pastas novas (checklist em
  `docs/arquitetura/dependencias.md`).

## Riscos

- Desativar a regra "so por hoje". Mitigacao: mudanca no arquivo de regras
  exige revisao explicita.

## Criterios para revisao futura

Revisar as regras ao criar um novo grupo de pastas de primeiro nivel em `src/`.
