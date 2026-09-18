# Regras de Dependencia

> Gate 2 · As regras aqui sao EXECUTADAS por `pnpm verificar:arquitetura`
> (arquivo `.dependency-cruiser.cjs`). A CI falha se alguma for violada. ADR-014.

## Fluxo permitido

```
                 ┌──────────────┐
                 │   src/app    │  telas e rotas
                 └──────┬───────┘
                        │ so publico.ts + composicao + compartilhado
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   modulos/*/publico  nucleo/*/publico  integracoes/*/publico
          │             │             │
   (dentro do modulo)   │             │
   interface → aplicacao → dominio    │
        ▲               │             │
   infraestrutura ──────┘ implementa  │
                                      │
   src/composicao ────────────────────┴──▶ integracoes/*/provedores  (SO a composicao)

   compartilhado/  ◀── todos podem usar; ele nao usa ninguem
```

## As regras, em portugues claro

1. **Sem ciclos.** Se A importa B e B importa A, quebre com um contrato ou um evento.
2. **Dominio e aplicacao nao conhecem frameworks.** Nada de `next`, `react`,
   `drizzle-orm`, `better-auth`, `postgres` em `dominio/` ou `aplicacao/`.
   `zod` e permitido (biblioteca pura de validacao).
3. **Frameworks so em camadas tecnicas:** `infraestrutura/`, `interface/`,
   `src/app/`, `src/proxy.ts`, `src/composicao/`, `src/banco-dados/`,
   `nucleo/banco-dados/`.
4. **Dominio nao importa camadas superiores** (aplicacao, infraestrutura, interface).
5. **Aplicacao nao importa infraestrutura nem interface** — depende de contratos.
6. **Modulos so se conhecem pelo `publico.ts`.** `@/modulos/contas-receber/publico`
   sim; `@/modulos/contas-receber/infraestrutura/...` nao.
7. **O mesmo vale dentro de `nucleo/` e de `integracoes/`.** Unica excecao:
   arquivos `esquema*.ts` podem importar outros esquemas (chaves estrangeiras).
8. **Modulos, app e integracoes usam o nucleo so pelo `publico.ts`.**
9. **Provedores externos (`provedores/`) so pela raiz de composicao.**
10. **SDKs de IA** so em `integracoes/inteligencia-artificial/provedores/`;
    **SDKs bancarios** so em `integracoes/bancarias/provedores/`.
11. **Nucleo nao importa modulos. Integracoes nao importam modulos.**
12. **Compartilhado nao importa nada interno.**
13. **`src/app` nunca importa dominio/aplicacao/infraestrutura diretamente**
    nem `src/banco-dados/`.
14. **`src/banco-dados/` so agrega esquemas.**
15. **`src/interface/` (sistema de design) nao conhece negocio:** nao importa
    `modulos/`, `banco-dados/`, `integracoes/`, `composicao/`, `app/` nem
    internos do `nucleo/` — so `publico.ts` (tipos como `Permissao`). Recebe
    dados prontos (ADR-024). Regra `sistema-de-design-nao-conhece-negocio`,
    acrescentada no Gate 5.

## Como verificar

```
pnpm verificar:arquitetura            # falha com lista de violacoes
pnpm verificar:arquitetura:grafico    # gera docs/arquitetura/grafo-dependencias.dot
```

Exemplo de saida ao violar:

```
error modulos-so-se-conhecem-pelo-publico: src/modulos/dre/dominio/x.ts → src/modulos/contas-pagar/dominio/erros.ts
```

Leia o nome da regra: ele diz o que fazer ("modulos so se conhecem pelo
publico" → importe de `contas-pagar/publico`).

## Lista de verificacao ao criar pastas novas

- Nova pasta de primeiro nivel em `src/`? Adicione-a nas regras
  `frameworks-so-em-camadas-tecnicas` e `compartilhado-nao-importa-nada-interno`.
- Novo modulo em `src/modulos/`? Nada a fazer: as regras usam padrao `[^/]+`.
- Nova integracao contratada? Adicione o pacote do SDK em
  `sdks-bancarios-so-em-provedores` (ou crie regra equivalente).
- Nova excecao? Justifique no comentario da regra e nesta pagina.

## Por que nao ESLint para isto

ESLint verifica um arquivo por vez; dependency-cruiser enxerga o grafo inteiro
(ciclos, grupos capturados como "$1" para dizer "o proprio modulo"). ESLint
continua responsavel por qualidade de codigo (`pnpm lint`).
