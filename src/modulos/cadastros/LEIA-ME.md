# cadastros

**Grupo:** Operacao financeira

Clientes e fornecedores (contrapartes). Cadastro minimo, busca tolerante a formatacao, deteccao de duplicidade.

**Pergunta que responde:** Com quem a empresa se relaciona financeiramente?

## Estrutura (criada conforme o modulo for implementado)

```
cadastros/
  dominio/         regras de negocio puras (sem Next.js, Drizzle ou APIs externas)
  aplicacao/       casos de uso e contratos de repositorio
  infraestrutura/  esquema Drizzle, repositorios, adaptadores
  interface/       rotas, server actions e componentes de tela deste modulo
  publico.ts       unica porta de entrada para outros modulos
```

Outros modulos importam SOMENTE `@/modulos/cadastros/publico`.
