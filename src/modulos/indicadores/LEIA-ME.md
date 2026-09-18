# indicadores

**Grupo:** Controle gerencial

Camada de indicadores (KPIs) com definicao, calculo e explicacao, e pontos de atencao por regra deterministica.

**Pergunta que responde:** Como o negocio esta performando?

## Estrutura (criada conforme o modulo for implementado)

```
indicadores/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/indicadores/publico`.
