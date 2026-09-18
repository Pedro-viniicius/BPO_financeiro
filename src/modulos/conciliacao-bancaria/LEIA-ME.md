# conciliacao-bancaria

**Grupo:** Operacao financeira

Casa linhas de extrato com movimentacoes registradas, com niveis de confianca e decisao humana obrigatoria para casos incertos.

**Pergunta que responde:** O que esta no banco bate com o que registrei?

## Estrutura (criada conforme o modulo for implementado)

```
conciliacao-bancaria/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/conciliacao-bancaria/publico`.
