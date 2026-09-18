# ADR-016 — Vocabulario em portugues no codigo

**Status:** Aceita · 2026-09-18

## Contexto

A equipe que vai manter o produto e brasileira e nem todos dominam
vocabulario tecnico em ingles. O repositorio deve ensinar a arquitetura ao
ser navegado.

## Decisao

- Pastas, arquivos, modulos, entidades, casos de uso, repositorios, permissoes,
  eventos, erros, tabelas e colunas **do nosso dominio** em portugues, sem
  acentos ou cedilha em identificadores (`conciliacao-bancaria`,
  `registrarPagamento`, `UsuarioSemPermissao`, `eventos_auditoria`).
- Testes: `*.teste.ts`; pontos de entrada: `publico.ts`, `indice.ts`;
  documentacao de pasta: `LEIA-ME.md`.
- **Mantidos em ingles** (vocabulario externo): nomes de bibliotecas e seus
  metodos (`signIn`, `getSession`, `drizzle`, `migrate`), tabelas exigidas
  pelo Better Auth (`user`, `session`, `account`, `verification`,
  `two_factor`), convencoes de framework (`app/`, `route.ts`, `page.tsx`,
  `layout.tsx`, `next.config.ts`), HTTP (`GET`, `POST`), scripts que
  ferramentas procuram (`dev`, `build`, `lint`), arquivos de ferramenta
  (`Dockerfile`, `docker-compose.yml`, `.github/workflows`).
- Quando um termo em ingles e inevitavel na documentacao, ele e explicado na
  primeira aparicao: "outbox (caixa de saida: tabela...)".
- O Gate 1 usou nomes em ingles para modulos (`financial-operations`,
  `treasury`...); a tabela de correspondencia esta em
  `docs/arquitetura/modulos.md` e `docs/domain.md` foi atualizado com a nota.

## Alternativas consideradas

- **Tudo em ingles** — rejeitado: contraria o objetivo de manutencao pela equipe.
- **Traduzir tambem APIs externas com "wrappers"** — rejeitado: cria camada
  falsa e confunde ao consultar a documentacao da biblioteca.

## Consequencias positivas

- Um desenvolvedor junior encontra `contas-pagar/` e `registrarPagamento()`
  sem dicionario.

## Consequencias negativas

- Mistura inevitavel nos pontos de contato com bibliotecas; documentada.

## Riscos

- Termos em ingles voltarem por habito. Mitigacao: revisao "portugues
  primeiro" ao final de cada gate (feita no Gate 2, secao do relatorio).

## Criterios para revisao futura

Nenhum previsto; e uma decisao de identidade do projeto.
