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

## Por que este modulo e quase igual ao de contas a pagar

Os dois repositorios sao 96% identicos depois de trocar o vocabulario
(pagar/receber, fornecedor/cliente). Isso e proposital, e ha um teste
guardando a simetria: `compartilhado/financeiro/simetria-pagar-receber.teste.ts`.

**A regra de dinheiro nao esta duplicada.** Ela vive em
`compartilhado/financeiro` — `abatimentoDaBaixa`, `saldoEmAberto`,
`situacaoDerivada`, `valorQueMovimentaOBanco` e as demais — e os dois lados
importam exatamente as mesmas funcoes. O que se repete e a camada que fala com
o banco.

**Por que ela nao foi unificada.** Unir exigiria montar nomes de tabela como
texto (`sql.raw`), porque as tabelas sao diferentes de verdade
(`titulos_pagar`/`parcelas_pagar`/`pagamentos` de um lado,
`titulos_receber`/`parcelas_receber`/`recebimentos` do outro, com
`valor_pago` contra `valor_recebido`). Isso apagaria a conferencia de tipos
justamente onde se mexe em dinheiro. Menos linhas nao compensa menos
seguranca aqui.

**O risco que sobra, e como ele e tratado.** O problema da duplicacao nao e o
tamanho: e alguem corrigir um lado e esquecer o outro — o que ja aconteceu no
Gate 5.1, quando este modulo nasceu de uma copia do outro. O teste de simetria
reprova quando um ganha uma operacao ou uma regra compartilhada que o outro nao
tem, e diz qual.
