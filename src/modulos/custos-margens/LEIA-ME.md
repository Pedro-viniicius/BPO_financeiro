# custos-margens

**Grupo:** Controle gerencial

Classificacao fixo/variavel, margens (bruta, contribuicao, operacional, gerencial) e ponto de equilibrio. Motor de calculo centralizado.

**Pergunta que responde:** Quanto sobra de cada real vendido?

## Estrutura (criada conforme o modulo for implementado)

```
custos-margens/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/custos-margens/publico`.
