# Dicionario de Dados

> O que cada tabela representa e o que cada campo importante significa no
> negocio (nao apenas o nome repetido). Campos tecnicos repetidos em quase
> todas as tabelas estao na secao final.
>
> Tipos: `UUID` identificador · `NUMERIC(15,2)` dinheiro · `NUMERIC(9,4)`
> percentual · `DATE` data civil de negocio · `TIMESTAMPTZ` instante em UTC.

## Indice de tabelas

| Tabela | Significado |
|---|---|
| `organizacoes` | Grupo empresarial ou cliente do escritorio de BPO |
| `empresas` | Pessoa juridica (CNPJ) dona dos dados financeiros |
| `filiais` | Unidade operacional de uma empresa |
| `vinculos_usuario` | Acesso de um usuario a uma empresa (ou a toda a organizacao) com um papel |
| `pessoas` | Identidade de quem se relaciona com a empresa (fisica ou juridica) |
| `clientes` | Papel de cliente que uma pessoa exerce perante uma empresa |
| `fornecedores` | Papel de fornecedor que uma pessoa exerce perante uma empresa |
| `instituicoes_bancarias` | O banco (Banco do Brasil, Nubank) |
| `contas_bancarias` | Onde a empresa guarda dinheiro, inclusive o caixa em especie |
| `contas_plano` | Linha do plano gerencial que define onde o valor aparece na DRE |
| `categorias_financeiras` | O que e o gasto/receita na lingua do dono |
| `centros_custo` | Area, projeto ou unidade que gastou ou gerou |
| `titulos_pagar` | Obrigacao da empresa com um fornecedor |
| `parcelas_pagar` | Cada vencimento de um titulo a pagar |
| `pagamentos` | Ato de pagar (total ou parte de) uma parcela |
| `recorrencias_pagar` | Regra que gera titulos a pagar repetidos |
| `titulos_receber` | Direito da empresa contra um cliente |
| `parcelas_receber` | Cada vencimento de um titulo a receber |
| `recebimentos` | Ato de receber (total ou parte de) uma parcela |
| `recorrencias_receber` | Regra que gera titulos a receber repetidos |
| `contatos_cobranca` | Registro de contato feito para cobrar uma parcela atrasada |
| `movimentacoes_bancarias` | Entrada ou saida efetiva em uma conta, segundo o sistema |
| `transferencias` | Dinheiro passando de uma conta da empresa para outra |
| `extratos_bancarios` | Um arquivo de extrato importado |
| `itens_extrato_bancario` | Uma linha do extrato: o que o banco informou |
| `conciliacoes_bancarias` | Decisao que liga itens de extrato a movimentacoes |
| `conciliacoes_itens_extrato` | Vinculo conciliacao ↔ item de extrato |
| `conciliacoes_movimentacoes` | Vinculo conciliacao ↔ movimentacao |
| `dividas` | Emprestimo ou financiamento |
| `parcelas_divida` | Prestacao com juros e amortizacao |
| `pagamentos_divida` | Pagamento de uma prestacao |
| `orcamentos` | Plano anual de uma empresa |
| `itens_orcamento` | Valor planejado para um mes, categoria e centro de custo |
| `arquivos` | Metadados de um arquivo guardado fora do banco |
| `anexos_*` | Vinculo entre um arquivo e um registro |
| `tokens_captura` | Token (so o hash) do QR code de envio de documentos de uma empresa |
| `documentos_capturados` | Documento enviado pela pagina publica, na fila de conferencia |
| `tentativas_captura` | Contador do limite de tentativas da pagina publica (sem empresa) |
| `sequencias_codigo` | Contador dos codigos legiveis (CP-2026-000123) |
| `eventos_auditoria` | Quem fez o que, quando (somente insercao) |
| `eventos_saida` | Eventos a entregar a outros modulos (outbox) |
| `tarefas` | Trabalho em segundo plano |
| `user`, `session`, `account`, `verification`, `two_factor` | Autenticacao (Better Auth) |
| `migracoes_aplicadas` | Controle de migracoes (Drizzle) |

## Estrutura empresarial

### `empresas`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `organizacao_id` | UUID | Sim | Grupo a que a empresa pertence |
| `nome` | TEXT | Sim | Razao social ou nome pelo qual o dono chama a empresa |
| `nome_fantasia` | TEXT | Nao | Nome comercial, usado nas telas e relatorios |
| `cnpj` | TEXT | Nao | Somente digitos (14). Unico na instalacao quando informado |
| `fuso_horario` | TEXT | Sim | Fuso usado para calcular o "hoje" desta empresa (padrao America/Sao_Paulo) |
| `ativa` | BOOLEAN | Sim | Empresa desativada some das listas, mas mantem o historico |

### `filiais`
`empresa_id` (Sim), `nome` (Sim), `ativa`. Unidade operacional; opcional em
todo o resto do modelo.

## Pessoas e parceiros

### `pessoas`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `organizacao_id` | UUID | Sim | A identidade e compartilhada pelo grupo, nao por empresa |
| `tipo` | enum | Sim | `fisica` (CPF) ou `juridica` (CNPJ) |
| `nome` | TEXT | Sim | Nome completo ou razao social |
| `nome_fantasia` | TEXT | Nao | Como e conhecida |
| `cpf_cnpj` | TEXT | Nao | Somente digitos; 11 se fisica, 14 se juridica (CHECK). Unico por organizacao |
| `email`, `telefone` | TEXT | Nao | Contato para cobranca |
| `ativo` | BOOLEAN | Sim | Desativar em vez de apagar |

### `clientes` / `fornecedores`
`empresa_id` + `pessoa_id` (par unico). `clientes.prazo_padrao_dias`: prazo
sugerido, em dias, ao criar um titulo a receber para este cliente.

## Bancos

### `contas_bancarias`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `tipo` | enum | Sim | `conta_corrente`, `conta_poupanca`, `conta_pagamento`, `aplicacao`, `caixa` |
| `nome` | TEXT | Sim | Apelido que o usuario reconhece ("BB principal") |
| `instituicao_bancaria_id` | UUID | Condicional | Obrigatorio exceto para `caixa` (CHECK) |
| `agencia`, `numero_conta` | TEXT | Nao | Identificacao no banco |
| `saldo_inicial` | NUMERIC(15,2) | Sim | Saldo na data de corte. **Unico saldo gravado** |
| `data_saldo_inicial` | DATE | Sim | Dia a que o saldo inicial se refere |
| `filial_id` | UUID | Nao | Quando a conta pertence a uma unidade |

### `instituicoes_bancarias`
`codigo_compensacao` (3 digitos, unico quando informado), `nome`, `ativa`.

## Classificacao financeira

### `contas_plano`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `codigo` | TEXT | Sim | Hierarquico: "3", "3.2", "3.2.01.004" (CHECK de formato). Unico por empresa |
| `nome` | TEXT | Sim | "Despesas com energia" |
| `grupo_dre` | enum | Sim | Linha da DRE: receita_bruta, deducao, custo, despesa_operacional, resultado_financeiro, nao_operacional, transferencia |
| `conta_pai_id` | UUID | Nao | Hierarquia (nao pode apontar para si) |
| `aceita_classificacao` | BOOLEAN | Sim | Falso nas contas agrupadoras (sinteticas) |
| `ordem` | INTEGER | Sim | Posicao na exibicao da DRE |

### `categorias_financeiras`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `nome` | TEXT | Sim | "Energia eletrica". Unico por empresa |
| `conta_plano_id` | UUID | Sim | **Como o lancamento chega a DRE** |
| `categoria_pai_id` | UUID | Nao | Agrupamento para o usuario |
| `natureza_custo` | enum | Nao | `fixo` ou `variavel`; necessario para margem de contribuicao e ponto de equilibrio |

### `centros_custo`
`codigo` (unico por empresa), `nome`, `centro_pai_id`, `filial_id` (quando o
centro corresponde a uma unidade).

## Contas a pagar

### `titulos_pagar`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `codigo` | TEXT | Sim | Identificador legivel CP-2026-000123, unico por empresa |
| `fornecedor_id` | UUID | Sim | A quem se deve |
| `descricao` | TEXT | Sim | O que e ("Conta de luz agosto") |
| `numero_documento` | TEXT | Nao | Numero da nota/boleto. Unico por fornecedor entre titulos nao cancelados |
| `data_emissao` | DATE | Nao | Quando o fornecedor emitiu o documento |
| `data_competencia` | DATE | Sim | **Mes a que a despesa pertence**, mesmo se paga depois |
| `valor_total` | NUMERIC(15,2) | Sim | Soma das parcelas (derivado mantido na transacao) |
| `quantidade_parcelas` | INTEGER | Sim | Quantas parcelas o titulo tem |
| `categoria_id` | UUID | Sim | Classificacao gerencial |
| `centro_custo_id` | UUID | Nao | Area responsavel |
| `situacao` | enum | Sim | `rascunho`, `aguardando_aprovacao`, `aberto`, `cancelado` ("pago" e derivado) |
| `recorrencia_pagar_id` | UUID | Nao | Preenchido quando foi gerado por uma recorrencia |
| `criado_por_usuario_id` / `aprovado_por_usuario_id` | TEXT | Nao | Segregacao de funcoes: precisam ser diferentes (CHECK) |
| `aprovado_em`, `cancelado_em`, `motivo_cancelamento` | — | Nao | Quando/por que mudou de estado |

### `parcelas_pagar`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `titulo_pagar_id` | UUID | Sim | Titulo a que pertence |
| `empresa_id` | UUID | Sim | Repetido de proposito (consulta de vencidas sem juncao) |
| `numero_parcela` | INTEGER | Sim | 1, 2, 3... Unico no titulo; > 0 |
| `data_vencimento` | DATE | Sim | **Dia em que a parcela deve ser paga** |
| `data_prevista_pagamento` | DATE | Nao | Quando se espera pagar de fato (projecao de caixa) |
| `valor_original` | NUMERIC(15,2) | Sim | Valor da parcela; sempre > 0 |
| `valor_pago` | NUMERIC(15,2) | Sim | Soma do principal dos pagamentos nao estornados |
| `situacao` | enum | Sim | `aberta`, `liquidada`, `cancelada` ("parcial" e "vencida" sao derivadas) |
| `forma_pagamento_prevista` | enum | Nao | Como se pretende pagar |
| `conta_bancaria_prevista_id` | UUID | Nao | De qual conta se pretende pagar |
| `referencia_pagamento` | TEXT | Nao | Linha digitavel / chave PIX do documento |

### `pagamentos`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `parcela_pagar_id` | UUID | Sim | Parcela que esta sendo paga |
| `conta_bancaria_id` | UUID | Sim | De onde o dinheiro saiu |
| `movimentacao_bancaria_id` | UUID | Sim | A saida correspondente. Unica por pagamento |
| `data_pagamento` | DATE | Sim | **Dia em que o dinheiro saiu** |
| `valor_principal` | NUMERIC(15,2) | Sim | Parte que abate a parcela |
| `valor_juros` / `valor_multa` | NUMERIC(15,2) | Sim | Acrescimos por atraso, separados do principal |
| `valor_desconto` | NUMERIC(15,2) | Sim | Reducao concedida |
| `valor_pago` | NUMERIC(15,2) | Sim | O que saiu da conta = principal + juros + multa − desconto (CHECK) |
| `forma_pagamento` | enum | Sim | PIX, boleto, transferencia... |
| `situacao` | enum | Sim | `registrado` ou `estornado` |
| `estornado_em`, `motivo_estorno`, `movimentacao_estorno_id` | — | Condicional | Presentes juntos quando estornado (CHECK) |

### `recorrencias_pagar` (e `recorrencias_receber`)
`descricao`, `valor`, `categoria_id`, `frequencia` (mensal, semanal...),
`dia_vencimento` (1-31, ajustado ao ultimo dia do mes), `data_inicio`,
`data_fim` (opcional), `proxima_geracao` (proxima competencia a gerar),
`ativa`.

## Contas a receber

Espelho de contas a pagar, com as diferencas:

### `titulos_receber`
`cliente_id` no lugar de fornecedor; `origem` (`manual`, `faturamento`,
`importacao`, `recorrencia`); nao existe aprovacao (CHECK proibe
`aguardando_aprovacao`); `numero_documento` unico por empresa.

### `parcelas_receber`
`data_prevista_recebimento` (quando se espera receber, util para cliente que
atrasa sempre); `valor_recebido`; `situacao` pode ser `perdida` com
`perdida_em` e `motivo_perda` (baixa por perda); `referencia_cobranca`
(linha digitavel/PIX enviado ao cliente).

### `recebimentos`
`data_recebimento`, `valor_recebido` = principal + juros + multa − desconto.

### `contatos_cobranca`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `parcela_receber_id` | UUID | Sim | Parcela atrasada que motivou o contato |
| `data_contato` | DATE | Sim | Quando falamos com o cliente |
| `canal` | TEXT | Sim | telefone, whatsapp, email, presencial |
| `resumo` | TEXT | Sim | O que ficou combinado |
| `proxima_acao`, `data_proxima_acao` | — | Nao | O que fazer e quando (alimenta a lista "cobrar hoje") |

## Movimentacoes e extratos

### `movimentacoes_bancarias`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `conta_bancaria_id` | UUID | Sim | Conta afetada |
| `data_movimentacao` | DATE | Sim | Dia em que o dinheiro se moveu |
| `tipo` | enum | Sim | `entrada` ou `saida` |
| `valor` | NUMERIC(15,2) | Sim | **Sempre positivo**; o sentido esta em `tipo` |
| `descricao` | TEXT | Sim | Texto que aparece no extrato do sistema |
| `origem` | enum | Sim | pagamento, recebimento, pagamento_divida, transferencia, estorno, ajuste_manual, extrato |
| `categoria_id` | UUID | Condicional | Obrigatoria quando `origem` e `extrato` ou `ajuste_manual` (CHECK) |
| `movimentacao_estornada_id` | UUID | Condicional | Presente se e so se `origem = estorno` (CHECK); uma original so pode ter um estorno |

### `transferencias`
`conta_origem_id` ≠ `conta_destino_id` (CHECK), `valor` > 0,
`movimentacao_saida_id` e `movimentacao_entrada_id` (cada uma usada em no
maximo uma transferencia).

### `extratos_bancarios`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `formato` | enum | Sim | ofx, csv, xlsx |
| `nome_arquivo_original` | TEXT | Sim | Como o usuario chamou o arquivo |
| `impressao_digital` | TEXT | Sim | SHA-256 do arquivo. **Impede reimportar o mesmo arquivo na conta** |
| `arquivo_id` | UUID | Nao | Arquivo guardado, para reprocessar |
| `data_inicio`, `data_fim` | DATE | Nao | Periodo coberto pelo extrato |
| `saldo_final_informado` | NUMERIC(15,2) | Nao | Saldo que o banco declarou; serve para conferir com o saldo calculado |
| `quantidade_itens` | INTEGER | Sim | Quantas linhas foram importadas |

### `itens_extrato_bancario`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `extrato_bancario_id` | UUID | Sim | Arquivo de origem (apagar o extrato apaga os itens) |
| `conta_bancaria_id` | UUID | Sim | Repetido: a unicidade do identificador e por conta, atravessando arquivos |
| `data_movimentacao` | DATE | Sim | Data informada pelo banco |
| `tipo`, `valor`, `descricao` | — | Sim | O que o banco informou |
| `identificador_externo` | TEXT | Nao | FITID do OFX. Unico por conta quando existe |
| `impressao_digital_linha` | TEXT | Sim | Hash da linha; idempotencia para CSV sem FITID. Unico por conta |
| `numero_documento` | TEXT | Nao | Numero informado pelo banco |
| `dados_brutos` | JSONB | Nao | Linha original, apenas para diagnostico |
| `ignorado_em`, `motivo_ignorar` | — | Condicional | Decisao de que a linha nao gera movimentacao (ambos ou nenhum) |

### `conciliacoes_bancarias`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `data_conciliacao` | DATE | Sim | Quando a conferencia foi feita |
| `confianca` | enum | Sim | `alta`, `possivel`, `revisao` — nivel da sugestao aceita |
| `origem_decisao` | enum | Sim | `manual`, `sugestao_aceita`, `lote` |
| `decidida_por_usuario_id` | TEXT | Nao | Quem confirmou |
| `desfeita_em`, `motivo_desfazer`, `desfeita_por_usuario_id` | — | Condicional | Desfazer nao apaga: registra |

Vinculos (`conciliacoes_itens_extrato`, `conciliacoes_movimentacoes`) tem
`ativo`, usado pelo indice unico parcial que garante "no maximo uma
conciliacao ativa por item/movimentacao".

## Credito e dividas

### `dividas`
`codigo` (DV-2026-000003), `credor_pessoa_id`, `tipo` (emprestimo,
financiamento, cartao_credito, cheque_especial, outro), `numero_contrato`,
`data_contratacao`, `valor_principal` (> 0), `taxa_juros_mensal`
(NUMERIC(9,4), ≥ 0), `sistema_amortizacao` (price, sac, outro),
`quantidade_parcelas`, `categoria_juros_id` (categoria usada para a despesa
financeira), `conta_bancaria_credito_id` (onde o dinheiro entrou),
`garantias` (texto livre), `situacao` (ativa, quitada, cancelada).

### `parcelas_divida`
`valor_amortizacao` (reduz o que se deve) + `valor_juros` = `valor_total`
(CHECK). `situacao`: aberta, paga, cancelada.

### `pagamentos_divida`
Como `pagamentos`, com `valor_encargos_atraso` (cobranca extra por atraso).

## Orcamento

### `orcamentos`
`nome`, `ano` (2000-2200), `situacao` (rascunho, ativo, encerrado).

### `itens_orcamento`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `competencia` | DATE | Sim | Primeiro dia do mes planejado (CHECK exige dia 1) |
| `categoria_id` | UUID | Sim | O que se planeja gastar/receber |
| `centro_custo_id` | UUID | Nao | Area; nulo = empresa inteira |
| `valor_planejado` | NUMERIC(15,2) | Sim | Quanto se pretende; ≥ 0 |

Combinacao (orcamento, competencia, categoria, centro) e unica — com `coalesce`
para que dois itens "sem centro de custo" nao coexistam.

## Captura de documentos (Gate 10)

Documento recebido pelo QR code **nao e** conta a pagar: fica em tabela
propria e a conta so nasce na aprovacao. Migracao `0010`.

### `tokens_captura`
`token_hash` (SHA-256 hex, unico — o token nunca e gravado),
`limite_envios_hora` (> 0, padrao 20, por empresa), `criado_por`,
`revogado_em`/`revogado_por` (andam juntos). **Um token ativo por empresa**:
indice unico parcial em `empresa_id` onde `revogado_em IS NULL`.

### `documentos_capturados`
| Campo | Tipo | Obrigatorio | Significado |
|---|---|---|---|
| `token_id` | UUID | Sim | Por qual token entrou; revogado continua explicando envios antigos |
| `codigo` | TEXT | Sim | Protocolo legivel (`DC-2026-000123`), unico por empresa |
| `situacao` | ENUM | Sim | `pendente_conferencia`, `aprovado`, `rejeitado`, `arquivado_sem_conferencia` |
| `chave_acesso` | TEXT | Nao | 44 posicoes; CNPJ pode ser alfanumerico (NT 2025.001). **Nao e unica**: duplicidade e aviso na fila |
| `data_competencia` | DATE | Nao | Definida na conferencia |
| `data_marco_retencao` | DATE | Nao | Congelada na conferencia/arquivamento: 5 anos a partir de 1o de janeiro seguinte a data mais tardia entre AAMM da chave, competencia e envio |
| `titulo_pagar_id` | UUID | Nao | Titulo criado na aprovacao; `SET NULL`, o vinculo sobrevive na auditoria |
| `entrou_na_fila_em` | TIMESTAMPTZ | Sim | Base da contagem de abandono; reabrir reinicia |
| `conferido_em`/`conferido_por` | | | Andam juntos; obrigatorios se aprovado ou rejeitado |
| `motivo_rejeicao` | TEXT | | Obrigatorio se rejeitado |
| `arquivado_em` | TIMESTAMPTZ | | Arquivamento automatico por abandono (sem `_por`: ninguem decidiu) |
| `reaberto_em`/`reaberto_por` | | | Andam juntos |
| `expurgado_em` | TIMESTAMPTZ | | Conteudo dos anexos removido no fim da retencao; a linha fica |

`anexos_documentos_capturados` segue o padrao `anexos_<entidade>`, com `ordem`
(a frente da nota antes do verso).

### `tentativas_captura`
`identificador` (hash do token ou IP anonimizado por HMAC — nunca IP em
claro), `janela_iniciada_em`, `contador` (≥ 0). Chave primaria composta.
**Sem `empresa_id`, de proposito**: pedido recusado na porta nao tem empresa.

## Arquivos e plataforma

### `arquivos`
`chave_armazenamento` (unica, opaca), `nome_original`, `tipo_conteudo`,
`tamanho_bytes` (> 0), `impressao_digital` (SHA-256 hex), `removido_em`.
Ver `anexos.md`.

### `sequencias_codigo`
`prefixo` (CP, CR, DV, DC), `ano`, `ultimo_numero` (≥ 0). Um registro por
(empresa, prefixo, ano).

### `eventos_auditoria`
`ocorrido_em`, `usuario_id`, `empresa_id`, `acao` ("conta_pagar.paga"),
`entidade`, `entidade_id`, `dados_antes`, `dados_depois` (JSONB), `origem`
(interface, importacao, api, tarefa, sistema), `ip`, `agente_usuario`,
`requisicao_id`. Somente insercao.

## Campos tecnicos comuns

| Campo | Tipo | Significado |
|---|---|---|
| `id` | UUID | Identificador interno. Nunca mostrado como referencia de negocio (para isso existe `codigo`) |
| `criado_em` | TIMESTAMPTZ | Quando a linha foi criada no sistema (UTC). **Nao e data de negocio** |
| `atualizado_em` | TIMESTAMPTZ | Ultima alteracao da linha |
| `ativo` / `ativa` | BOOLEAN | Cadastro desativado: some das listas, mantem o historico |
| `observacoes` | TEXT | Texto livre do usuario |
| `empresa_id` | UUID | Dona do registro; toda consulta filtra por ele |
