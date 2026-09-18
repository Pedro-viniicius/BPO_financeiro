# orcamento

**Grupo:** Controle gerencial

Orcamento mensal por categoria/centro de custo e comparacao planejado x realizado com variacao favoravel/desfavoravel.

**Pergunta que responde:** Estamos gastando conforme o planejado?

## Estrutura (criada conforme o modulo for implementado)

```
orcamento/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/orcamento/publico`.
