# Indices

> Um indice acelera a leitura e custa espaco e tempo de escrita. Por isso cada
> indice aqui existe por causa de uma CONSULTA REAL prevista nas jornadas do
> Gate 1. Nao indexamos "por precaucao".
>
> Regra: medir antes de otimizar. Particoes, views materializadas e indices
> extras so entram com evidencia (`EXPLAIN ANALYZE`, `pg_stat_statements`).

## Indices de unicidade (regras de negocio, nao desempenho)

Estes existem para IMPEDIR estados impossiveis; a velocidade e efeito colateral.

| Indice | Impede |
|---|---|
| `unico_pessoas_documento` (organizacao, cpf_cnpj) parcial | mesma pessoa cadastrada duas vezes |
| `unico_clientes_empresa_pessoa`, `unico_fornecedores_empresa_pessoa` | papel duplicado |
| `unico_contas_bancarias_nome`, `unico_categorias_nome`, `unico_contas_plano_codigo`, `unico_centros_custo_codigo` | cadastro duplicado por empresa |
| `unico_instituicoes_codigo` parcial | dois bancos com o mesmo codigo de compensacao |
| `unico_titulos_pagar_codigo`, `unico_titulos_receber_codigo`, `unico_dividas_codigo` | dois registros com o mesmo codigo legivel |
| `unico_titulos_pagar_documento` / `unico_titulos_receber_documento` parciais | lancar a mesma nota duas vezes (ignora cancelados) |
| `unico_parcelas_pagar_numero`, `unico_parcelas_receber_numero`, `unico_parcelas_divida_numero` | duas parcelas "numero 2" no mesmo titulo |
| `unico_pagamentos_movimentacao`, `unico_recebimentos_movimentacao`, `unico_pagamentos_divida_movimentacao` | uma movimentacao servindo a dois pagamentos |
| `unico_pagamentos_movimentacao_estorno`, `unico_recebimentos_movimentacao_estorno`, `unico_movimentacoes_estorno` parciais | estornar duas vezes |
| `unico_transferencias_saida` / `_entrada` | movimentacao usada em duas transferencias |
| `unico_extratos_impressao` (conta, impressao) | reimportar o mesmo arquivo |
| `unico_itens_extrato_identificador` (conta, FITID) parcial | importar o mesmo lancamento do banco |
| `unico_itens_extrato_impressao` (conta, hash da linha) | idem, para CSV sem FITID |
| `unico_conciliacao_item_ativo` / `unico_conciliacao_movimentacao_ativa` parciais (`WHERE ativo`) | item/movimentacao em duas conciliacoes ativas |
| `unico_conciliacao_item_vinculo` / `_movimentacao_vinculo` | vinculo repetido na mesma conciliacao |
| `unico_itens_orcamento_dimensoes` (com `coalesce` do centro) | dois valores planejados para a mesma celula |
| `unico_orcamentos_nome` (empresa, ano, nome) | orcamentos duplicados |
| `unico_sequencias_codigo` (empresa, prefixo, ano) | dois contadores para a mesma serie |
| `unico_arquivos_chave` | duas linhas apontando para o mesmo objeto |
| `unico_anexos_*` (entidade, arquivo) | anexar o mesmo arquivo duas vezes |

## Indices de consulta

| Indice | Consulta que atende (jornada) | Por que compensa |
|---|---|---|
| `parcelas_pagar_empresa_situacao_vencimento_idx` (empresa, situacao, vencimento) | **A consulta mais usada do sistema**: "contas vencidas / a vencer da empresa" (tela Hoje, alertas, fluxo previsto, J2/J3) | filtra empresa+situacao e ja devolve ordenado por vencimento, sem ordenacao extra e sem juncao com titulos (por isso `empresa_id` e repetido na parcela) |
| `parcelas_receber_empresa_situacao_vencimento_idx` | espelho: recebimentos atrasados e previstos (J2, J6) | idem |
| `parcelas_divida_empresa_situacao_vencimento_idx` | calendario de dividas | idem |
| `pagamentos_empresa_data_idx`, `recebimentos_empresa_data_idx` | fluxo de caixa realizado e DRE por regime de caixa em um periodo (J7) | varredura por faixa de data dentro da empresa |
| `pagamentos_parcela_idx`, `recebimentos_parcela_idx`, `pagamentos_divida_parcela_idx` | "quais pagamentos esta parcela recebeu?" (tela do titulo, recalculo de `valor_pago`, estorno) | evita varrer a tabela de pagamentos |
| `movimentacoes_conta_data_idx` (conta, data) | **saldo da conta em uma data** = soma das movimentacoes ate a data (posicao de caixa, J2) | percorre so a faixa necessaria |
| `movimentacoes_empresa_data_idx` | fluxo de caixa consolidado de todas as contas | idem, sem juncao com contas |
| `titulos_pagar_empresa_situacao_idx`, `titulos_receber_empresa_situacao_idx` | listas de titulos por situacao | filtro basico das telas de lista |
| `titulos_pagar_empresa_competencia_idx`, `titulos_receber_empresa_competencia_idx` | **DRE por competencia** de um mes (J7) | faixa de competencia por empresa |
| `titulos_pagar_fornecedor_idx`, `titulos_receber_cliente_idx` | "historico deste fornecedor/cliente" (J6, ficha do parceiro) | |
| `itens_extrato_conta_data_idx` | fila de conciliacao: itens da conta no periodo (J5) | |
| `itens_extrato_extrato_idx` | itens de um extrato recem-importado; reverter importacao | |
| `extratos_conta_data_idx` | historico de importacoes da conta | |
| `conciliacoes_conta_data_idx`, `conciliacoes_empresa_idx` | historico de conciliacao | |
| `categorias_empresa_conta_plano_idx` | montar a DRE: categorias de cada linha do plano (J7) | |
| `contas_plano_empresa_grupo_idx` (empresa, grupo_dre) | somar por linha da DRE | |
| `itens_orcamento_categoria_competencia_idx` | planejado x realizado por categoria/mes (J7) | |
| `orcamentos_empresa_ano_idx` | lista de orcamentos do ano | |
| `recorrencias_pagar_empresa_ativa_idx` / `receber` (empresa, ativa, proxima_geracao) | tarefa "gerar titulos recorrentes de hoje" | varre so as recorrencias devidas |
| `contatos_cobranca_parcela_idx` | historico de cobranca da parcela (J6) | |
| `contatos_cobranca_proxima_acao_idx` (empresa, data_proxima_acao) | "o que cobrar hoje" (J6) | |
| `arquivos_empresa_impressao_idx` | detectar anexo duplicado (mesmo hash) | |
| `pessoas_organizacao_nome_idx` | busca de cliente/fornecedor por nome | prefixo; busca tolerante a acento fica para o Gate 6 |
| `clientes_empresa_idx`, `fornecedores_empresa_idx`, `contas_bancarias_empresa_idx`, `centros_custo_empresa_idx`, `filiais_empresa_idx`, `empresas_organizacao_idx` | listas de cadastro por empresa | tabelas pequenas, indice barato |
| `dividas_empresa_situacao_idx` | dividas ativas da empresa | |
| Gate 2: `tarefas_pendentes_idx`, `eventos_saida_pendentes_idx`, `eventos_auditoria_*` | fila, outbox e consulta de auditoria | |

## O que NAO foi indexado (de proposito)

| Coluna/consulta | Por que nao |
|---|---|
| `titulos_*.descricao` (busca textual) | busca global chega no Gate 6; ai avaliaremos `pg_trgm`/`unaccent` com medicao |
| `categoria_id` em titulos | a DRE parte de competencia+empresa; o filtro por categoria vem depois, sobre poucas linhas |
| `centro_custo_id` | idem |
| `filial_id` | poucas filiais; o filtro por empresa ja reduz o suficiente |
| `situacao` sozinha | sempre usada junto com `empresa_id` (o indice composto ja cobre) |
| Colunas `*_por_usuario_id` | consultadas por curiosidade, nao em tela critica |
| Indices em `anexos_*` alem do unico | tabelas pequenas |

## Como medir depois (Gate 10)

```sql
-- indices nunca usados (candidatos a remocao)
SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY relname;
-- consultas mais caras (exige extensao pg_stat_statements)
SELECT calls, mean_exec_time, query FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;
-- plano de uma consulta especifica
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```
Ver `observabilidade.md`.
