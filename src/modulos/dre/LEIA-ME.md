# dre

**Grupo:** Controle gerencial

DRE gerencial (competencia e caixa) consolidando dados dos modulos operacionais. Nao e demonstracao contabil oficial.

**Pergunta que responde:** A empresa deu resultado no periodo?

## Estrutura (criada conforme o modulo for implementado)

```
dre/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/dre/publico`.
