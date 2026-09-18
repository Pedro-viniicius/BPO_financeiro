# bancos

**Grupo:** Tesouraria

Contas financeiras (banco, conta de pagamento, caixa), saldo inicial, movimentacoes realizadas, extratos importados. O saldo e sempre derivado.

**Pergunta que responde:** Quanto tem em cada conta?

## Estrutura (criada conforme o modulo for implementado)

```
bancos/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/bancos/publico`.
