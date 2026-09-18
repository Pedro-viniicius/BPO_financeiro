# importacao

**Grupo:** Plataforma

Pipeline generico de importacao: enviar, interpretar, validar, pre-visualizar, duplicidades, erros, confirmar, gravar, auditar.

**Pergunta que responde:** Como trago dados de fora com seguranca?

## Estrutura (criada conforme o modulo for implementado)

```
importacao/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/importacao/publico`.
