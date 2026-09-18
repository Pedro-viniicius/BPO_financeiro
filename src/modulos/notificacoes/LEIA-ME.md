# notificacoes

**Grupo:** Plataforma

Alertas no aplicativo e por e-mail (contas vencidas, falta de caixa prevista, aprovacoes pendentes).

**Pergunta que responde:** O que precisa da minha atencao?

## Estrutura (criada conforme o modulo for implementado)

```
notificacoes/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/notificacoes/publico`.
