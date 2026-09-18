# centros-custo

**Grupo:** Controle gerencial

Areas, projetos ou unidades que gastam/geram: base para orcamento e analise por area.

**Pergunta que responde:** Qual area gastou/gerou?

## Estrutura (criada conforme o modulo for implementado)

```
centros-custo/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/centros-custo/publico`.
