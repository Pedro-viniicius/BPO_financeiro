# Glossario do Modelo de Dados

> Termos financeiros em portugues simples, na ordem em que aparecem no
> fluxo do dinheiro. Complementa `docs/produto/05-glossario.md`.

| Termo | Significado simples | No banco |
|---|---|---|
| **Titulo** | Um documento que representa dinheiro a pagar ou a receber: uma nota, um boleto, um contrato. | `titulos_pagar`, `titulos_receber` |
| **Parcela** | Uma "fatia" do titulo com vencimento e valor proprios. Um titulo em 3x tem 3 parcelas. | `parcelas_pagar`, `parcelas_receber` |
| **Competencia** | O mes (ou dia) a que a receita/despesa pertence, independente de quando o dinheiro se move. Conta de luz de agosto tem competencia agosto mesmo paga em setembro. | `data_competencia` |
| **Emissao** | Dia em que o documento foi emitido pelo fornecedor ou pela empresa. | `data_emissao` |
| **Vencimento** | Ultimo dia para pagar/receber sem atraso. | `data_vencimento` |
| **Data prevista** | Quando se ESPERA que o dinheiro se mova (pode ser depois do vencimento, se o cliente atrasa sempre). Alimenta a projecao de caixa. | `data_prevista_pagamento`, `data_prevista_recebimento` |
| **Pagamento / Recebimento** | O ato de pagar ou receber. Diz quando, quanto, por qual conta e com juros/multa/desconto. | `pagamentos`, `recebimentos` |
| **Baixa** | Termo tradicional para "registrar que uma parcela foi paga/recebida". Na interface dizemos "Marcar como pago" e "Confirmar recebimento". | operacao `registrarPagamento` / `registrarRecebimento` |
| **Liquidacao** | Sinonimo de baixa total: a parcela ficou quitada. | `situacao = 'liquidada'` |
| **Baixa parcial** | Pagou/recebeu so uma parte. A parcela continua aberta com saldo. | `valor_pago < valor_original` (derivado) |
| **Baixa por perda** | Desistir de cobrar: a parcela e dada como incobravel, sem dinheiro entrar. So em contas a receber. | `situacao = 'perdida'` |
| **Estorno** | Desfazer um pagamento/recebimento registrado por engano. Nao apaga: marca o registro como estornado e cria uma movimentacao inversa. | `situacao = 'estornado'`, `movimentacao_estorno_id` |
| **Cancelamento** | Um titulo que nao vai mais ser pago/recebido (nota cancelada, negocio desfeito). Mantido no historico. | `situacao = 'cancelado'` |
| **Juros** | Acrescimo proporcional ao atraso. | `valor_juros` |
| **Multa** | Acrescimo fixo por atraso. | `valor_multa` |
| **Desconto** | Reducao concedida (pagamento antecipado, negociacao). | `valor_desconto` |
| **Principal** | A parte do pagamento que abate a parcela (sem juros/multa/desconto). | `valor_principal` |
| **Conta bancaria** | Onde o dinheiro esta: conta corrente, poupanca, conta de pagamento (fintech), aplicacao ou o **caixa** (dinheiro em especie). | `contas_bancarias` |
| **Instituicao bancaria** | O banco em si (Banco do Brasil, Nubank). Uma instituicao, varias contas. | `instituicoes_bancarias` |
| **Movimentacao bancaria** | Uma entrada ou saida efetiva em uma conta, segundo o sistema. Nasce de pagamento, recebimento, transferencia, ajuste ou conciliacao. | `movimentacoes_bancarias` |
| **Transferencia** | Dinheiro saindo de uma conta da empresa e entrando em outra. Nao e receita nem despesa. | `transferencias` |
| **Saldo** | Quanto ha na conta em uma data = saldo inicial + entradas − saidas. Calculado, nunca digitado. | (derivado) |
| **Extrato** | O arquivo que o banco fornece (OFX/CSV) com o que ELE registrou. | `extratos_bancarios` |
| **Item de extrato** | Uma linha do extrato. | `itens_extrato_bancario` |
| **Conciliacao** | Conferir que o que o banco informou bate com o que a empresa registrou, ligando itens de extrato a movimentacoes. | `conciliacoes_bancarias` |
| **Confianca (alta / possivel / revisao)** | Quao segura e a sugestao automatica de conciliacao. So "alta" pode ser aceita em lote; as demais exigem decisao humana. | `confianca` |
| **Categoria financeira** | O QUE e o gasto/receita, na lingua do dono: "Energia eletrica", "Vendas de balcao". | `categorias_financeiras` |
| **Plano de contas (gerencial)** | Estrutura hierarquica (3.2.01.004) que agrupa categorias e define em qual linha da DRE cada valor aparece. Nao e o plano contabil oficial. | `contas_plano` |
| **Centro de custo** | QUAL AREA gastou ou gerou: loja, setor, projeto. | `centros_custo` |
| **DRE gerencial** | Resumo de receitas − custos − despesas = resultado, por competencia ou por caixa. Feito para gestao, nao para o fisco. | consulta sobre `grupo_dre` |
| **Regime de competencia / de caixa** | Ver o resultado pelo mes a que pertence (competencia) ou pelo mes em que o dinheiro se moveu (caixa). | `data_competencia` vs `data_pagamento` |
| **Custo fixo / variavel** | Fixo nao muda com o volume vendido (aluguel); variavel muda (materia-prima). | `natureza_custo` |
| **Orcamento** | Plano de quanto se pretende gastar/receber por mes, categoria e centro de custo. | `orcamentos`, `itens_orcamento` |
| **Planejado x realizado** | Comparar o orcamento com o que de fato aconteceu. Consulta, nao tabela. | — |
| **Divida** | Emprestimo ou financiamento: principal, juros, parcelas, amortizacao. | `dividas` |
| **Amortizacao** | Parte da parcela da divida que reduz o que se deve (o resto e juros). | `valor_amortizacao` |
| **Saldo devedor** | Quanto ainda se deve = principal − amortizacao ja paga. Calculado. | (derivado) |
| **Capital de giro** | Dinheiro necessario para manter a operacao funcionando entre pagar fornecedores e receber de clientes. | consulta |
| **Recorrencia** | Regra que gera titulos repetidos (aluguel todo dia 5). | `recorrencias_pagar`, `recorrencias_receber` |
| **Codigo legivel** | Identificador amigavel (CP-2026-000123) separado do id tecnico (UUID). | `codigo` |
| **Idempotencia** | Fazer a mesma coisa duas vezes da o mesmo resultado que uma: reimportar um arquivo nao duplica lancamentos. | `impressao_digital`, `identificador_externo`, `chave_idempotencia` |
| **Impressao digital (hash)** | Resumo unico de um conteudo (SHA-256). Se dois arquivos tem a mesma impressao, sao o mesmo arquivo. | `impressao_digital` |
| **Anexo** | Arquivo ligado a um registro (boleto, nota, comprovante). | `arquivos` + `anexos_*` |
| **Auditoria** | Registro de quem fez o que e quando, que ninguem pode alterar. | `eventos_auditoria` |
