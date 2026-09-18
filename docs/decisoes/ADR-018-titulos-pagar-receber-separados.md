# ADR-018 — Contas a pagar e a receber em estruturas separadas

**Status:** Aceita · 2026-09-18

## Contexto

`titulos_pagar`/`parcelas_pagar`/`pagamentos` e
`titulos_receber`/`parcelas_receber`/`recebimentos` tem forma parecida: titulo,
parcelas, baixas com juros/multa/desconto, vinculo com movimentacao bancaria.
A tentacao e unificar em `titulos_financeiros` com uma coluna `tipo`
(pagar/receber) para "evitar duplicacao".

## Decisao

**Manter estruturas separadas**, espelhadas mas independentes. Nao criar
tabela generica de titulo, parcela ou baixa.

O que e compartilhado, e como:
- **Objetos de valor**: `Dinheiro`, `Percentual`, `DataCivil` (em `compartilhado/`).
- **Enums**: `situacao_titulo`, `situacao_parcela`, `situacao_baixa`,
  `forma_pagamento`, `frequencia_recorrencia` (em `esquemas/enumeracoes.ts`).
- **Construtores de coluna**: `colunaDinheiro`, `colunaDataCivil`,
  `colunasTecnicas` (em `esquemas/colunas-comuns.ts`).
- **Destino comum**: ambos desaguam em `movimentacoes_bancarias`, que e unica.
  O fluxo de caixa, o saldo e a conciliacao trabalham so com movimentacoes —
  e ali que a unificacao realmente importa e ela existe.

## Alternativas consideradas

### A. Tabela unica `titulos_financeiros` com `tipo` — rejeitada

- A contraparte seria `fornecedor_id` OU `cliente_id`: duas colunas nulaveis
  com CHECK de exclusividade, ou uma coluna polimorfica sem chave estrangeira.
  Qualquer das duas enfraquece o banco como guardiao.
- Campos que so existem de um lado virariam colunas nulaveis: aprovacao e
  segregacao de funcoes (so pagar), `origem` e baixa por perda (so receber),
  `referencia_pagamento` x `referencia_cobranca`.
- Toda consulta passaria a carregar `WHERE tipo = 'pagar'`; esquecer isso em
  um relatorio somaria despesas com receitas — erro grave e silencioso.
- A DRE, o fluxo de caixa e as telas ja tratam os dois lados separadamente.
- Os modulos `contas-pagar` e `contas-receber` sao contextos delimitados
  distintos (Gate 1); uma tabela comum criaria acoplamento entre eles.

### B. Tabela base + tabelas de extensao (heranca) — rejeitada

`titulos` + `titulos_pagar_detalhe`. Juncao obrigatoria em toda consulta,
sem ganho real: os "campos comuns" sao poucos e baratos.

### C. Duplicacao total, sem compartilhar nem enums — rejeitada

Levaria a divergencia de vocabulario (`situacao` com valores diferentes de
cada lado) e a duas regras de arredondamento.

## Diferencas reais entre os dois lados (justificam a separacao)

| Aspecto | Contas a pagar | Contas a receber |
|---|---|---|
| Contraparte | `fornecedor_id` | `cliente_id` |
| Aprovacao | `aguardando_aprovacao`, `aprovado_por`, CHECK de segregacao | nao existe (CHECK proibe o estado) |
| Origem | recorrencia ou manual | `origem`: manual, faturamento, importacao, recorrencia |
| Baixa por perda | nao existe (CHECK proibe `perdida`) | `situacao = 'perdida'`, `perdida_em`, `motivo_perda` |
| Referencia de pagamento | codigo de barras que a empresa **paga** | referencia que a empresa **envia** ao cliente |
| Cobranca | nao se aplica | `contatos_cobranca` |
| Movimentacao gerada | saida | entrada |
| Quem costuma pagar parcial | raro | comum |

## Consequencias positivas

- Cada tabela expressa exatamente o seu lado do negocio; sem coluna nulavel
  "que so vale quando tipo = X".
- Chaves estrangeiras reais para fornecedor e cliente.
- Constraints especificas (segregacao de funcoes; proibicao de `perdida` no
  pagar) sao possiveis.
- Extrair `contas-receber` para outro servico no futuro nao arrasta o pagar.

## Consequencias negativas

- Codigo espelhado: uma mudanca de regra comum (ex.: novo campo de baixa) e
  feita duas vezes. Mitigacao: enums e construtores de coluna compartilhados;
  testes espelhados; revisao que compara os dois lados.
- ~2× tabelas nessa area (6 em vez de 3).

## Riscos

- Os dois lados divergirem por descuido (ex.: `valor_pago` aqui,
  `total_recebido` ali). Mitigacao: `padrao-nomenclatura.md` e o teste
  estrutural de nomes.

## Criterios para revisao futura

Revisar se surgir um terceiro tipo de titulo com a mesma forma (ex.: titulos
de terceiros em um servico de BPO), ou se a duplicacao passar a causar bugs
reais de divergencia — o que seria evidencia, e nao suposicao.
