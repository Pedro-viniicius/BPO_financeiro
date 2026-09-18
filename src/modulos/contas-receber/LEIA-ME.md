# contas-receber

**Grupo:** Operacao financeira

Direitos da empresa contra clientes: registro, recebimento (total ou parcial), cancelamento, recorrencia e parcelas.

**Pergunta que responde:** O que tenho a receber, quando, e ja recebi?

## Estrutura (criada conforme o modulo for implementado)

```
contas-receber/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/contas-receber/publico`.
