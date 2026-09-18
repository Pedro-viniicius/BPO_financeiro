# ADR-007 — Permissoes granulares, negar por padrao

**Status:** Aceita · 2026-09-18

## Contexto

Empresas pequenas tem um administrador; empresas medias e escritorios de BPO
precisam de segregacao de funcoes (quem registra nao aprova), acesso de
contador somente leitura e auditor. Papeis amplos ("admin", "user") nao
expressam isso.

## Decisao

**RBAC + permissoes granulares**, implementado em `src/nucleo/autorizacao/`:

- **Permissao** e a unidade real de autorizacao: `<modulo>.<acao>` em
  portugues (`contas_pagar.aprovar`, `bancos.conciliar`, `dre.exportar`).
  Catalogo unico em `permissoes.ts` (57 permissoes iniciais).
- **Papel** e um conjunto nomeado de permissoes: Administrador, Financeiro,
  Tesouraria, Controladoria, Auditor, Somente leitura. O papel Financeiro
  nao aprova pagamentos; Tesouraria aprova e paga, mas nao registra.
- Cada vinculo usuario↔empresa tem um papel e pode ter `permissoes_extras`
  e `permissoes_removidas` (ajuste fino sem criar papeis).
- **Politica central** (`politica-autorizacao.ts`): `possuiPermissao`,
  `exigirPermissao`. **Negar por padrao**: sem permissao explicita, nao.
- Verificacao **sempre no servidor**, no inicio de cada caso de uso, a partir
  do `ContextoUsuario` (permissoes efetivas ja resolvidas para a empresa
  ativa). Esconder botoes na interface e cortesia, nao seguranca.
- Erros: `UsuarioSemPermissao`, `UsuarioSemAcessoAEmpresa`.

## Alternativas consideradas

- **Somente papeis** — rejeitado: nao permite segregacao fina nem ajustes
  por cliente.
- **ABAC completo (politicas por atributo)** — rejeitado por ora: complexidade
  desnecessaria; a estrutura permite evoluir (a politica e uma funcao).
- **Biblioteca externa (Casbin, CASL)** — rejeitado: 60 linhas de codigo
  proprio resolvem e sao mais faceis de auditar.

## Consequencias positivas

- Testavel sem banco nem framework (8 testes ja cobrem a politica).
- Novos modulos so acrescentam permissoes ao catalogo e aos papeis.

## Consequencias negativas

- Catalogo cresce; precisa de revisao a cada gate para nao virar lista solta.

## Riscos

- Caso de uso esquecer `exigirPermissao`. Mitigacao: padrao de codigo
  (primeira linha do caso de uso) e testes de autorizacao por modulo (Gate 5+).

## Criterios para revisao futura

Introduzir permissoes por registro (ex.: "so ve o centro de custo X") apenas
se clientes reais pedirem.
