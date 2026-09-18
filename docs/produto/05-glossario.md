# Glossário de Negócio

> Gate 1 — Produto e Domínio · Documento 5 de 6

Este glossário é a **linguagem ubíqua** do produto. Três colunas importam:

- **Termo na interface** — o que o usuário vê. Sempre em pt-BR, sempre na
  linguagem do dono, não do contador.
- **Nome técnico** — identificador usado no código, banco e contratos. Em
  inglês, único, sem sinônimos.
- **Definição** — significado exato. Quando um termo técnico é inevitável, a
  definição é a que a interface mostra ao usuário em "O que é isso?".

Regras:
1. Não existem dois nomes técnicos para o mesmo conceito.
2. Não existem dois conceitos com o mesmo nome técnico.
3. Rótulos de botão descrevem a ação real (ver seção 9).

---

## 1. Organização e pessoas

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Empresa | `Organization` | A entidade dona dos dados financeiros. Todo registro de negócio pertence a exatamente uma. |
| Usuário | `User` | Pessoa que acessa o sistema. Pode pertencer a várias empresas. |
| Vínculo | `Membership` | Ligação entre um usuário e uma empresa, com um papel. |
| Papel | `Role` | Conjunto nomeado de permissões: Administrador, Financeiro, Gestor, Consulta. |
| Permissão | `Permission` / `capability` | Capacidade atômica, ex.: `accounts_payable.create`, `banking.reconcile`, `reports.view`. |
| Convite | `Invitation` | Convite pendente para uma pessoa entrar em uma empresa com um papel. |
| Segregação de funções | `dutySegregation` | Configuração em que quem registra um pagamento não pode aprová-lo. |
| Cliente | `Customer` | Quem deve dinheiro à empresa (origem de contas a receber). |
| Fornecedor | `Supplier` | A quem a empresa deve dinheiro (destino de contas a pagar). |

## 2. Estrutura financeira

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Categoria | `Category` | Classificação de um lançamento pela natureza: receita, dedução, custo, despesa operacional, resultado financeiro. Hierárquica (grupo → categoria). |
| Tipo de categoria | `CategoryKind` | `revenue`, `deduction`, `cost`, `operating_expense`, `financial`, `transfer`, `other`. |
| Centro de custo | `CostCenter` | Área, projeto ou unidade que "gasta" ou "gera": Loja Centro, Produção, Administrativo. Opcional por lançamento. |
| Modelo de categorias | `CategoryTemplate` | Conjunto pronto de categorias por segmento (comércio, serviços, indústria), aplicado na configuração inicial. |
| Linha da DRE | `DreLine` | Uma linha da DRE gerencial (Receita Bruta, Deduções, …) à qual categorias são mapeadas. |

## 3. Contas a pagar e a receber

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Conta a pagar | `Payable` | Obrigação da empresa com um fornecedor: valor, vencimento, categoria. |
| Conta a receber | `Receivable` | Direito da empresa contra um cliente: valor, vencimento, categoria. |
| Lançamento | `Entry` (termo genérico de UI) | Palavra guarda-chuva na interface para pagáveis, recebíveis e movimentações. **Não existe entidade `Entry` no código**; cada tipo tem sua entidade. |
| Parcela | `Installment` | Uma das partes de um pagável/recebível parcelado. Tem seu próprio vencimento, valor e status. |
| Recorrência | `RecurrenceRule` | Regra que gera lançamentos repetidos: mensal, semanal, anual, personalizada; com data de fim opcional. |
| Valor | `amount` (`Money`) | Valor original do lançamento. Decimal + moeda. |
| Valor pago / recebido | `settledAmount` | Valor efetivamente movimentado. Pode diferir do original por juros, multa, desconto ou recebimento parcial. |
| Juros | `interestAmount` | Acréscimo por atraso, registrado separadamente. |
| Multa | `penaltyAmount` | Acréscimo fixo por atraso, registrado separadamente. |
| Desconto | `discountAmount` | Redução concedida, registrada separadamente. |
| Registro de pagamento / recebimento | `Settlement` | Ato de marcar como pago ou confirmar recebimento: data, valor, conta financeira, forma, juros/multa/desconto. Gera uma movimentação financeira. |
| Forma de pagamento | `PaymentMethod` | PIX, boleto, transferência, cartão, dinheiro, débito automático, cheque, outro. |
| Número do documento | `documentNumber` | Identificador do documento de origem (nota, boleto, contrato). Usado na detecção de duplicidade. |
| Anexo | `Attachment` | Arquivo vinculado (boleto, nota, comprovante). |
| Observações | `notes` | Texto livre. |
| Origem | `origin` | De onde veio o lançamento: manual, importação, recorrência, parcelamento, conciliação, API. |

### Status de conta a pagar

| Interface | Técnico | Significado |
|---|---|---|
| Rascunho | `draft` | Incompleto (sem valor ou vencimento) ou recusado na aprovação. Não entra em projeções. |
| Aguardando aprovação | `awaiting_approval` | Registrado; precisa de aprovação (segregação ativa). Entra em projeções como previsto. |
| Pendente | `pending` | Pronto para pagar. Entra em projeções. |
| Agendado | `scheduled` | Pagamento programado para uma data (informativo; não há execução bancária no MVP). |
| Vencido | `overdue` (derivado) | Pendente/agendado com vencimento no passado. Não é gravado; é calculado. |
| Pago | `paid` | Liquidado. Possui `Settlement` e movimentação. |
| Cancelado | `cancelled` | Não será pago. Sai das projeções. Mantido no histórico. |

### Status de conta a receber

| Interface | Técnico | Significado |
|---|---|---|
| A receber | `open` | Aguardando recebimento. |
| Atrasado | `overdue` (derivado) | Em aberto com vencimento no passado. |
| Parcialmente recebido | `partially_received` | Parte do valor recebida; saldo em aberto. |
| Recebido | `received` | Liquidado integralmente. |
| Cancelado | `cancelled` | Não será recebido. |

## 4. Datas (nunca sobrepostas)

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Competência | `competenceDate` | Mês/data a que a receita ou despesa "pertence" economicamente (ex.: aluguel de março, mesmo pago em abril). Usada na DRE por competência. Padrão = vencimento. |
| Vencimento | `dueDate` | Data limite para pagar/receber. |
| Data prevista | `expectedDate` | Quando se espera que o dinheiro realmente se mova (pode diferir do vencimento). Usada na projeção de caixa. Padrão = vencimento. |
| Data de pagamento | `paymentDate` | Quando o pagamento de fato ocorreu. Só existe em `Settlement` de pagável. |
| Data de recebimento | `receiptDate` | Quando o recebimento de fato ocorreu. Só existe em `Settlement` de recebível. |
| Data da movimentação | `transactionDate` | Data em que a movimentação aconteceu na conta financeira (data civil). |
| Data do extrato | `statementEntryDate` | Data informada pelo banco para a linha do extrato. |
| Criado em | `createdAt` | Timestamp de sistema (UTC). Nunca usado como data de negócio. |

## 5. Bancos e caixa

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Conta financeira | `FinancialAccount` | Qualquer lugar onde a empresa guarda dinheiro. Subtipos: conta bancária, conta de pagamento (ex.: fintech/adquirente), caixa (dinheiro físico). |
| Conta bancária | `FinancialAccount(kind: bank)` | Conta em banco, com banco, agência e número (opcionais). |
| Caixa | `FinancialAccount(kind: cash)` | Dinheiro em espécie. |
| Saldo inicial | `OpeningBalance` | Saldo da conta em uma data de corte, informado na configuração. É um registro auditável. |
| Movimentação | `FinancialTransaction` | Entrada, saída ou transferência **realizada** em uma conta financeira. Altera o saldo realizado. |
| Transferência | `Transfer` | Par de movimentações (saída de uma conta, entrada em outra) vinculadas. Não é receita nem despesa. |
| Saldo disponível | `availableBalance` | Saldo realizado hoje: saldo inicial + movimentações até hoje. |
| Saldo projetado | `projectedBalance` | Saldo disponível + entradas previstas − saídas previstas até uma data. |
| Extrato | `BankStatement` | Arquivo importado de uma conta (OFX/CSV/XLSX) com suas linhas. Possui impressão digital do arquivo. |
| Linha de extrato | `BankStatementEntry` | Um item do extrato: data, descrição, valor, identificador do banco (FITID no OFX, quando existir). |

## 6. Conciliação

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Conciliação | `Reconciliation` | Confirmar que uma linha do extrato corresponde a uma movimentação registrada no sistema. |
| Conciliar | ação `reconcile` | Aceitar uma correspondência. |
| Correspondência | `ReconciliationMatch` | Ligação entre linha(s) de extrato e movimentação(ões), com nível de confiança e quem decidiu. |
| Correspondência alta | `confidence: high` | Mesmo valor, data próxima, contraparte reconhecida. Pode ser aceita em lote com pré-visualização. |
| Possível correspondência | `confidence: possible` | Valor igual, mas data ou descrição divergentes. Exige decisão humana. |
| Revisão necessária | `confidence: review` | Sem sugestão confiável. Exige decisão humana. |
| Ignorar linha | `ignore` | Marcar uma linha de extrato como não relevante, com motivo (ex.: estorno duplicado do banco). |
| Criar a partir do extrato | `createFromStatement` | Gerar uma nova movimentação (e opcionalmente um pagável/recebível já pago) a partir de uma linha sem correspondência, ex.: tarifa bancária. |

## 7. Tesouraria

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Posição de caixa | `CashPosition` | Foto de hoje: saldo por conta, consolidado, entradas e saídas esperadas hoje. |
| Fluxo de caixa | `CashFlow` | Entradas e saídas ao longo do tempo (dia/semana/mês), separando **realizado** e **previsto**. |
| Realizado | `actual` | Já aconteceu: baseado em movimentações. |
| Previsto | `expected` | Ainda vai acontecer: baseado em pagáveis/recebíveis pendentes e recorrências. |
| Projeção de caixa | `CashForecast` | Saldo projetado dia a dia para um horizonte (7, 30, 90 dias). Lista as premissas. |
| Premissa | `TreasuryAssumption` | Hipótese explícita usada na projeção, ex.: "recebíveis atrasados são recebidos com 15 dias de atraso". |
| Falta de caixa prevista | `ProjectedCashDeficit` | Dia em que o saldo projetado fica negativo, com o valor e os lançamentos que causam. |
| Capital de giro | `workingCapital` | Dinheiro necessário para manter a operação funcionando entre pagamentos e recebimentos. |
| Prazo médio de recebimento | `averageCollectionPeriod` | Quantos dias, em média, a empresa leva para receber após vender. |
| Prazo médio de pagamento | `averagePaymentPeriod` | Quantos dias, em média, a empresa leva para pagar seus fornecedores. |
| Dívida | `Debt` | Empréstimo ou financiamento: credor, valor original, saldo devedor, taxa de juros, parcelas, garantias (opcional). |
| Parcela da dívida | `DebtInstallment` | Uma prestação com vencimento, valor, parte de juros e parte de amortização. |
| Amortização | `principalAmount` | Parte da parcela que reduz o saldo devedor. |
| Calendário de dívidas | `DebtCalendar` | Visão das parcelas de todas as dívidas por data. |

## 8. Controle gerencial

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| DRE Gerencial | `ManagerialIncomeStatement` | Demonstração do resultado para gestão. **Não é** o documento contábil oficial. |
| Receita Bruta | `grossRevenue` | Total vendido/faturado no período. |
| Deduções | `deductions` | Impostos sobre vendas, devoluções, descontos concedidos. |
| Receita Líquida | `netRevenue` | Receita Bruta − Deduções. |
| Custos | `costs` | Gastos diretamente ligados ao que foi vendido (mercadoria, matéria-prima, mão de obra direta). |
| Lucro Bruto | `grossProfit` | Receita Líquida − Custos. |
| Despesas Operacionais | `operatingExpenses` | Gastos para manter a empresa funcionando (administrativo, comercial, marketing, pessoal indireto). |
| Resultado Operacional | `operatingResult` | Lucro Bruto − Despesas Operacionais. |
| Resultado Financeiro | `financialResult` | Juros recebidos − juros pagos, tarifas, rendimentos. |
| Resultado Gerencial | `managerialResult` | Resultado Operacional ± Resultado Financeiro. |
| Regime de competência | `accrualBasis` | DRE montada pela data de competência. |
| Regime de caixa | `cashBasis` | DRE montada pela data de pagamento/recebimento. |
| Custo fixo | `fixedCost` | Não varia com o volume vendido (aluguel, salários fixos). |
| Custo variável | `variableCost` | Varia com o volume (matéria-prima, comissão). |
| Custo direto / indireto | `directCost` / `indirectCost` | Atribuível diretamente a um produto/serviço ou não. Marcação opcional na categoria. |
| Margem Bruta | `grossMargin` | Lucro Bruto ÷ Receita Líquida. "De cada R$ 100 de receita líquida, quanto sobrou após os custos diretos." |
| Margem de Contribuição | `contributionMargin` | (Receita Líquida − Custos e Despesas Variáveis) ÷ Receita Líquida. Só calculada quando há classificação fixo/variável suficiente. |
| Margem Operacional | `operatingMargin` | Resultado Operacional ÷ Receita Líquida. |
| Margem Gerencial | `managerialMargin` | Resultado Gerencial ÷ Receita Líquida. |
| Ponto de equilíbrio | `breakEven` | Quanto precisa vender para cobrir todos os custos. Custos Fixos ÷ Margem de Contribuição %. |
| Orçamento | `Budget` | Plano de receitas e gastos por mês, categoria, centro de custo. |
| Linha de orçamento | `BudgetLine` | Um valor planejado para (mês, categoria, centro de custo opcional). |
| Planejado | `planned` | Valor do orçamento. |
| Realizado | `actual` | Valor efetivamente ocorrido (mesmo termo de tesouraria; mesmo significado). |
| Variação | `variance` | Realizado − Planejado, em R$ e %. |
| Favorável / Desfavorável | `favorable` / `unfavorable` | Interpretação da variação conforme o tipo: receita acima do planejado é favorável; despesa acima é desfavorável. |
| Indicador | `Kpi` | Número que resume um aspecto do negócio, com definição, cálculo e explicação. |
| Ponto de atenção | `AttentionPoint` | Alerta gerado por regra determinística (ex.: variação > 20%). Não usa IA. |

## 9. Análises (IA)

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Assistente Financeiro / Análises | `ai-insights` | Área onde o usuário vê pontos de atenção, faz perguntas e monta cenários. |
| Análise | `AIAnalysis` | Uma pergunta e sua resposta estruturada: Conclusão, Dados usados, Premissas, Cálculo, Incerteza, Cenários. |
| Cenário | `AIScenario` | Conjunto de premissas alteradas ("vendas −10%") e o resultado recalculado pelo motor de cálculo. |
| Provedor de IA | `AIInsightProvider` | Abstração do modelo de linguagem. Substituível. |

## 10. Importação e integrações

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Importação | `ImportJob` | Um processo de importação de arquivo, com status e resultado. |
| Pré-visualização | `preview` | Etapa em que o usuário vê o que será gravado antes de confirmar. |
| Duplicidade provável | `probableDuplicate` | Registro parecido com um existente (por ID externo, documento, valor + data + contraparte, referência bancária ou impressão digital). Sinalizado, nunca apagado automaticamente. |
| Impressão digital | `fingerprint` | Hash do arquivo ou da linha, usado para idempotência. |
| Adaptador / Provedor | `Provider`/`Adapter` | Implementação de um contrato de integração (OFX, CSV, Open Finance…). |

## 11. Segurança, auditoria e licença

| Termo na interface | Nome técnico | Definição |
|---|---|---|
| Histórico | `AuditEvent` | Registro imutável de quem fez o quê, quando, com valor anterior e novo. |
| Lixeira | `deletedAt` (soft delete) | Registros excluídos logicamente, recuperáveis. |
| Desfazer | `undo` | Reversão imediata da última ação, quando tecnicamente possível. |
| Verificação em duas etapas | `MFA` / TOTP | Código de aplicativo autenticador, opcional. |
| Códigos de recuperação | `RecoveryCode` | Códigos de uso único para recuperar acesso sem o autenticador. |
| Licença | `License` | Direito de uso de uma versão maior do produto. |
| Versão do produto | `ProductVersion` | Ex.: 1.4.2. O primeiro número é a versão maior licenciada. |
| Recurso habilitado | `FeatureGate` | Abstração pela qual o sistema pergunta se um recurso está disponível na licença atual. |

## 12. Rótulos de ação (padrão obrigatório)

| Usar | Não usar |
|---|---|
| Adicionar conta | Novo título / Incluir |
| Marcar como pago | Efetuar baixa / Liquidar |
| Confirmar recebimento | Efetuar liquidação / Baixar |
| Desfazer pagamento | Estornar baixa |
| Importar extrato | Upload / Processar arquivo |
| Conciliar | Executar conciliação |
| Ignorar linha | Descartar |
| Criar orçamento | Novo budget |
| Comparar com realizado | Gerar análise |
| Registrar contato | Log de cobrança |
| Convidar usuário | Adicionar acesso |
| Aprovar / Recusar | Autorizar / Rejeitar |
| Restaurar | Reativar |
| Excluir (vai para a lixeira) | Deletar / Remover definitivamente |

Botões vagos — "Executar", "Processar", "Continuar", "Enviar", "OK" — são
proibidos, salvo quando o contexto imediato torna a ação inequívoca (ex.:
"Enviar" em um formulário de convite pode ser "Enviar convite").

## 13. Termos que ensinamos ao usuário

Alguns termos técnicos são importantes demais para serem evitados. Nesses
casos a interface os usa **e** explica, em uma linha, na primeira aparição e
sob demanda (ícone "O que é isso?"):

- **Capital de giro** — "Dinheiro necessário para manter a operação funcionando
  entre pagamentos e recebimentos."
- **Competência** — "O mês a que a despesa ou receita pertence, mesmo que o
  pagamento aconteça em outro."
- **Margem de contribuição** — "O que sobra de cada venda, depois dos custos
  que variam com ela, para pagar os custos fixos e gerar lucro."
- **Ponto de equilíbrio** — "Quanto você precisa vender no mês para não ter
  prejuízo."
- **Conciliação** — "Conferir se o que está no banco bate com o que você
  registrou."
- **DRE Gerencial** — "Um resumo de quanto entrou, quanto saiu por tipo e
  quanto sobrou. Feito para gestão, não é o documento oficial do contador."
