# Padrao de Nomenclatura

> Vale para tudo que o projeto controla no banco. Tabelas do Better Auth
> (`user`, `session`, `account`, `verification`, `two_factor`) e a tabela de
> controle do Drizzle (`migracoes_aplicadas.created_at`) seguem as bibliotecas (ADR-016).
> O teste `estrutura-modelo.teste.ts` falha se uma coluna do projeto usar
> `created_at`, `status`, `amount`, `name`, `date`.

## Geral

- **snake_case**, portugues, sem acento/cedilha: `contas_bancarias`, `data_vencimento`.
- Sem abreviacoes obscuras. `movimentacoes_bancarias`, nunca `mov_banc`.
- Tabelas no **plural** (colecoes): `pessoas`, `titulos_pagar`, `itens_extrato_bancario`.
- Tabelas de vinculo N:N: `<pai>_<filho>` no plural: `conciliacoes_itens_extrato`.
- Tabelas de anexo por entidade: `anexos_<entidade>`: `anexos_titulos_pagar`.

## Colunas

| Tipo de coluna | Padrao | Exemplos |
|---|---|---|
| Chave primaria | `id UUID` gerado pelo banco | — |
| Chave estrangeira | `<entidade no singular>_id` | `empresa_id`, `fornecedor_id`, `conta_bancaria_id`, `titulo_pagar_id` |
| Auto-referencia | `<papel>_pai_id` ou `<x>_estornada_id` | `categoria_pai_id`, `movimentacao_estornada_id` |
| Codigo legivel | `codigo` | `CP-2026-000123`, `3.2.01.004`, `01` |
| Datas de negocio | `data_<significado>` — tipo `DATE` | `data_emissao`, `data_competencia`, `data_vencimento`, `data_pagamento`, `data_recebimento`, `data_movimentacao`, `data_conciliacao` |
| Instantes tecnicos | `<verbo no participio>_em` — tipo `TIMESTAMPTZ` (UTC) | `criado_em`, `atualizado_em`, `importado_em`, `estornado_em`, `desfeita_em`, `cancelado_em`, `perdida_em` |
| Dinheiro | `valor_<significado>` ou `saldo_<significado>` — `NUMERIC(15,2)` | `valor_original`, `valor_pago`, `valor_juros`, `saldo_inicial` |
| Percentual/taxa | `taxa_<significado>` ou `percentual_<x>` — `NUMERIC(9,4)` | `taxa_juros_mensal` |
| Booleano | adjetivo concordando com a tabela | `ativo`/`ativa`, `aceita_classificacao` |
| Situacao | `situacao` (enum) | `aberta`, `liquidada`, `cancelada` |
| Quem fez | `<acao>_por_usuario_id` | `criado_por_usuario_id`, `aprovado_por_usuario_id`, `decidida_por_usuario_id` |
| Motivo | `motivo_<acao>` | `motivo_cancelamento`, `motivo_estorno`, `motivo_desfazer` |
| Texto livre | `descricao` (obrigatoria, curta), `observacoes` (opcional, longa) | — |
| Identificador de fora | `identificador_externo`, `referencia_externa` (ver `concorrencia.md`) | FITID |
| Hash | `impressao_digital[_linha]` (SHA-256 hex) | — |
| Dados brutos tecnicos | `dados_brutos JSONB` | linha original do extrato |

Nunca: `data`, `timestamp`, `created`, `status`, `is_active`, `amount`, `type` genericos.

## Restricoes e indices

| Objeto | Padrao | Exemplo |
|---|---|---|
| Unicidade | `unico_<tabela>_<significado>` | `unico_pessoas_documento`, `unico_parcelas_pagar_numero` |
| CHECK | `verifica_<tabela>_<significado>` | `verifica_pagamentos_total`, `verifica_titulos_pagar_aprovador` |
| Indice de consulta | `<tabela>_<colunas>_idx` | `parcelas_pagar_empresa_situacao_vencimento_idx` |
| Chave estrangeira | gerada pelo Drizzle: `<tabela>_<coluna>_<tabela_ref>_id_fk` | `pagamentos_parcela_pagar_id_parcelas_pagar_id_fk` |
| Gatilho | `<tabela>_<proposito>` | `auditoria_somente_insercao` |

## Enumeracoes (situacoes)

Decisao: **ENUM do PostgreSQL** para conjuntos que sao fatos do negocio e
mudam raramente; **nunca** para estados derivados.

| Enum | Valores | Usado em |
|---|---|---|
| `tipo_pessoa` | fisica, juridica | pessoas |
| `tipo_conta_bancaria` | conta_corrente, conta_poupanca, conta_pagamento, aplicacao, caixa | contas_bancarias |
| `tipo_movimentacao` | entrada, saida | movimentacoes, itens de extrato |
| `origem_movimentacao` | pagamento, recebimento, pagamento_divida, transferencia, estorno, ajuste_manual, extrato | movimentacoes |
| `forma_pagamento` | pix, boleto, transferencia, cartao_credito, cartao_debito, dinheiro, debito_automatico, cheque, outro | pagamentos, recebimentos, parcelas |
| `situacao_titulo` | rascunho, aguardando_aprovacao, aberto, cancelado | titulos_pagar, titulos_receber |
| `situacao_parcela` | aberta, liquidada, cancelada, perdida | parcelas_pagar (sem perdida), parcelas_receber |
| `situacao_baixa` | registrado, estornado | pagamentos, recebimentos, pagamentos_divida |
| `frequencia_recorrencia` | semanal, quinzenal, mensal, bimestral, trimestral, semestral, anual | recorrencias |
| `formato_extrato` | ofx, csv, xlsx | extratos |
| `confianca_conciliacao` | alta, possivel, revisao | conciliacoes |
| `origem_decisao_conciliacao` | manual, sugestao_aceita, lote | conciliacoes |
| `grupo_dre` | receita_bruta, deducao, custo, despesa_operacional, resultado_financeiro, nao_operacional, transferencia | contas_plano |
| `natureza_custo` | fixo, variavel | categorias |
| `origem_titulo_receber` | manual, faturamento, importacao, recorrencia | titulos_receber |
| `tipo_divida`, `situacao_divida`, `sistema_amortizacao`, `situacao_parcela_divida` | ver categorias/credito-dividas.md | dividas |
| `situacao_orcamento` | rascunho, ativo, encerrado | orcamentos |

**Estados derivados que NAO existem no banco** (calculados na consulta):
`vencida` (aberta e vencimento < hoje), `parcial` (0 < valor_pago < valor_original),
titulo `pago`/`recebido` (todas as parcelas liquidadas), item de extrato
`conciliado` (existe vinculo ativo), movimentacao `conciliada` (idem),
divida `saldo_devedor`, conta `saldo_atual`.

Por que ENUM e nao tabela de referencia: os valores tem comportamento no codigo
(maquina de estados); uma tabela editavel pelo usuario permitiria estados que
o codigo nao conhece. Por que ENUM e nao CHECK: o tipo aparece em `\d` e no
Drizzle com autocompletar; adicionar valor e `ALTER TYPE ... ADD VALUE`
(sem reescrever a tabela). Remover valor exige migracao com conversao —
aceitavel dado que remover um estado e evento raro e deliberado.

## Arquivos

- Esquema Drizzle: `src/modulos/<modulo>/infraestrutura/esquema.ts` (ou `src/nucleo/<servico>/infraestrutura/esquema.ts`).
- Enums e construtores comuns: `src/banco-dados/esquemas/enumeracoes.ts`, `colunas-comuns.ts`.
- Migracoes: `src/banco-dados/migracoes/NNNN_<descricao_em_portugues>.sql`.
- Testes de integracao: `src/banco-dados/testes/*.teste.ts`.
