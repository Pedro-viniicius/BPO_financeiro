# caixa

**Grupo:** Tesouraria

Posicao de caixa de hoje: saldo por conta, consolidado, entradas e saidas do dia.

**Pergunta que responde:** Quanto dinheiro tenho agora?

## Estrutura (criada conforme o modulo for implementado)

```
caixa/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/caixa/publico`.
