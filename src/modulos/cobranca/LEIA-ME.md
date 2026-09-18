# cobranca

**Grupo:** Operacao financeira

Gestao de recebiveis atrasados: contatos, proxima acao, renegociacao. Nao e CRM.

**Pergunta que responde:** Quem esta atrasado e qual e o proximo passo?

## Estrutura (criada conforme o modulo for implementado)

```
cobranca/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/cobranca/publico`.
