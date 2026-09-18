# contas-pagar

**Grupo:** Operacao financeira

Obrigacoes da empresa com fornecedores: registro, aprovacao, pagamento, cancelamento, recorrencia e parcelas.

**Pergunta que responde:** O que devo pagar, quando, e ja foi pago?

## Estrutura (criada conforme o modulo for implementado)

```
contas-pagar/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/contas-pagar/publico`.
