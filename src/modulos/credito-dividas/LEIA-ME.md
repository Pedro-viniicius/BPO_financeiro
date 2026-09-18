# credito-dividas

**Grupo:** Tesouraria

Emprestimos e financiamentos: saldo devedor, juros, parcelas, amortizacao, calendario de dividas.

**Pergunta que responde:** Quanto devo a bancos e quando vence?

## Estrutura (criada conforme o modulo for implementado)

```
credito-dividas/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/credito-dividas/publico`.
