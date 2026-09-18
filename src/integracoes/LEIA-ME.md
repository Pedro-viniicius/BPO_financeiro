# integracoes/

Tudo que conversa com o mundo externo: bancos, contabilidade, IA, e-mail,
webhooks. Organizado em **portas e adaptadores**:

- `contratos/` — a porta: interfaces TypeScript que os modulos financeiros usam.
- `provedores/` — os adaptadores: implementacoes concretas (um por banco/servico).
- `publico.ts` — o que o resto do sistema pode importar (somente contratos e o gateway).

Regra verificada por lint: `modulos/` e `nucleo/` nunca importam `provedores/`.
A escolha do provedor acontece na composicao da aplicacao (configuracao),
o que permite contratar integracoes separadamente (docs/licenciamento.md).
