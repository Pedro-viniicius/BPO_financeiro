# faturamento

**Grupo:** Operacao financeira

Documentos de cobranca internos (fatura gerencial, recibo) e referencias de pagamento (PIX/boleto via adaptadores). Sem motor fiscal.

**Pergunta que responde:** Como cobro formalmente o cliente?

## Estrutura (criada conforme o modulo for implementado)

```
faturamento/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/faturamento/publico`.
