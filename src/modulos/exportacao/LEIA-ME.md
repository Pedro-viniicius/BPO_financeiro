# exportacao

**Grupo:** Plataforma

Exportacao de relatorios e listas (CSV, PDF simples) e exportacao de dados para o titular (LGPD).

**Pergunta que responde:** Como levo os dados para fora?

## Estrutura (criada conforme o modulo for implementado)

```
exportacao/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/exportacao/publico`.
