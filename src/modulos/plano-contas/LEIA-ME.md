# plano-contas

**Grupo:** Controle gerencial

Categorias financeiras (receita, deducao, custo, despesa, financeiro), modelos por segmento e mapeamento para linhas da DRE gerencial.

**Pergunta que responde:** Como classifico o que entra e sai?

## Estrutura (criada conforme o modulo for implementado)

```
plano-contas/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/plano-contas/publico`.
