# capital-giro

**Grupo:** Tesouraria

Indicadores de capital de giro: prazos medios, necessidade de capital de giro, liquidez de curto prazo, em linguagem simples.

**Pergunta que responde:** Quanto preciso para manter a operacao rodando?

## Estrutura (criada conforme o modulo for implementado)

```
capital-giro/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/capital-giro/publico`.
