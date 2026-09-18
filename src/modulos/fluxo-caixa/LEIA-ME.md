# fluxo-caixa

**Grupo:** Tesouraria

Entradas e saidas ao longo do tempo (dia/semana/mes), sempre separando realizado de previsto.

**Pergunta que responde:** De onde veio e para onde foi o dinheiro?

## Estrutura (criada conforme o modulo for implementado)

```
fluxo-caixa/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/fluxo-caixa/publico`.
