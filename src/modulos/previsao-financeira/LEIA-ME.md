# previsao-financeira

**Grupo:** Tesouraria

Projecao de caixa (7/30/90 dias) com premissas explicitas e deteccao de falta de caixa.

**Pergunta que responde:** Vai faltar dinheiro? Quando? Por que?

## Estrutura (criada conforme o modulo for implementado)

```
previsao-financeira/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/previsao-financeira/publico`.
