# Domínio e Contextos Delimitados

> Gate 1 — Produto e Domínio · Documento 4 de 6
> Este arquivo é o documento canônico do domínio (`docs/domain.md`). Ele será
> refinado no Gate 3 (modelo de dados), mas os limites aqui definidos são a
> base do monólito modular.
>
> **Nota do Gate 2 (ADR-016):** os nomes de módulo usados abaixo estão em
> inglês porque foram escritos antes da decisão de vocabulário em português.
> Os nomes definitivos das pastas em `src/modulos/` e `src/nucleo/` estão em
> [`arquitetura/modulos.md`](arquitetura/modulos.md), que traz a tabela de
> correspondência (ex.: `financial-operations` → `contas-pagar`,
> `contas-receber`, `cobranca`, `cadastros`; `banking` → `bancos`;
> `reconciliation` → `conciliacao-bancaria`; `financial-structure` →
> `plano-contas` + `centros-custo`; `management-control` → `dre`,
> `custos-margens`, `indicadores`; `budget` → `orcamento`). O modelo de
> tenancy foi precisado na ADR-005: single-tenant por instalação,
> multiempresa (organização → empresa → filial) internamente.

## 1. Por que contextos delimitados

O sistema é um **monólito modular**. Cada contexto delimitado vira um módulo
em `/modules/<nome>` com fronteira explícita. A regra que sustenta tudo:

> Um módulo só conversa com outro módulo pela **interface pública** dele
> (serviços de aplicação, contratos, eventos de domínio). Nunca lendo as
> tabelas do outro diretamente.

Isso permite extrair um módulo para serviço independente no futuro sem
reescrever o resto — e, mais importante, mantém o código compreensível hoje.

## 2. Mapa de contextos

```
┌───────────────────────────────────────────────────────────────────────────┐
│  NÚCLEO COMPARTILHADO (shared kernel)                                     │
│  Money (valor + moeda) · Datas financeiras · OrganizationId · UserId      │
│  Result/erros de domínio · Eventos de domínio · Paginação                 │
└───────────────────────────────────────────────────────────────────────────┘

  IDENTIDADE E ACESSO ───────────────┐
  authentication · users ·           │ fornece: quem é o usuário, em qual
  organizations                      │ organização está, o que pode fazer
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ESTRUTURA FINANCEIRA (financial-structure)                           │
  │ categorias · centros de custo · mapeamento categoria → linha da DRE  │
  └──────────────┬───────────────────────────┬───────────────────────────┘
                 │ upstream                  │ upstream
                 ▼                           ▼
  ┌──────────────────────────┐   ┌────────────────────────────────────────┐
  │ OPERAÇÕES FINANCEIRAS    │   │ BANCOS (banking)                       │
  │ (financial-operations)   │   │ contas financeiras · saldos ·          │
  │ contas a pagar/receber · │──▶│ movimentações · extratos importados    │
  │ clientes · fornecedores ·│   └──────────────┬─────────────────────────┘
  │ cobrança                 │                  │
  └──────────┬───────────────┘                  ▼
             │                    ┌────────────────────────────────────────┐
             │                    │ CONCILIAÇÃO (reconciliation)           │
             │◀───────────────────│ casa lançamentos × linhas de extrato   │
             │                    └────────────────────────────────────────┘
             ▼
  ┌──────────────────────────┐   ┌────────────────────────────────────────┐
  │ FATURAMENTO (billing)    │   │ TESOURARIA (treasury)                  │
  │ documentos de cobrança · │   │ posição de caixa · fluxo de caixa ·    │
  │ referências de pagamento │   │ projeção · capital de giro · dívidas   │
  └──────────────────────────┘   └──────────────┬─────────────────────────┘
                                                │ lê (somente leitura)
  ┌──────────────────────────┐   ┌──────────────▼─────────────────────────┐
  │ ORÇAMENTO (budget)       │──▶│ CONTROLE GERENCIAL (management-control)│
  │ orçamentos · linhas      │   │ DRE gerencial · margens · KPIs ·       │
  └──────────────────────────┘   │ orçado × realizado · motor de cálculo  │
                                 └──────────────┬─────────────────────────┘
                                                │ lê resultados calculados
                                 ┌──────────────▼─────────────────────────┐
                                 │ ANÁLISES (ai-insights)                 │
                                 │ pontos de atenção · perguntas ·        │
                                 │ cenários · provedor de IA substituível │
                                 └────────────────────────────────────────┘

  TRANSVERSAIS (consomem eventos, não são consultados pelo domínio financeiro)
  ┌─────────────┐ ┌──────────────┐ ┌─────────┐ ┌───────────────┐ ┌──────────┐
  │ integrations│ │ notifications│ │ audit   │ │ reports       │ │ settings │
  │ importação, │ │ e-mail, app  │ │ trilha  │ │ exportação,   │ │ prefs da │
  │ adaptadores │ │              │ │         │ │ consultas     │ │ empresa  │
  └─────────────┘ └──────────────┘ └─────────┘ └───────────────┘ └──────────┘

  FORA DO DOMÍNIO FINANCEIRO
  ┌──────────────────────────────────────────────────────────────────────┐
  │ LICENCIAMENTO (licensing) — versão, licença, capacidades habilitadas │
  │ O financeiro pergunta "recurso X está habilitado?" via abstração.    │
  └──────────────────────────────────────────────────────────────────────┘
```

## 3. Descrição de cada contexto

Para cada contexto: responsabilidade, o que **possui** (é dono dos dados),
o que **consome**, o que **publica**, e o que **não faz**.

### 3.1 Identidade e Acesso
Módulos: `authentication`, `users`, `organizations`.

- **Responsabilidade:** autenticar pessoas, gerenciar sessões, vincular
  usuários a organizações com papéis, resolver capacidades.
- **Possui:** `User`, `Credential`, `Session`, `MfaSecret`, `RecoveryCode`,
  `Organization`, `Membership`, `Role`, `Permission`, `Invitation`.
- **Publica:** `UserInvited`, `MembershipRevoked`, `SessionRevoked`.
- **Contrato exposto ao resto do sistema:** `CurrentContext { userId,
  organizationId, capabilities[] }` e `AuthorizationPolicy.can(capability)`.
- **Não faz:** nada de financeiro. Não sabe o que é uma conta a pagar.

### 3.2 Estrutura Financeira
Módulo: `financial-structure`.

- **Responsabilidade:** dar forma ao plano financeiro da empresa — categorias
  (receita, custo, despesa, financeiro), centros de custo, e o mapeamento de
  cada categoria para uma linha da DRE gerencial.
- **Possui:** `Category`, `CostCenter`, `DreLineDefinition`,
  `CategoryTemplate` (modelos por segmento).
- **Consumido por:** operações financeiras (classificação), orçamento
  (linhas), controle gerencial (DRE), tesouraria (recorrentes por categoria).
- **Não faz:** não armazena lançamentos; não calcula nada.
- **Justificativa de existir como contexto próprio:** categorias e centros de
  custo são compartilhados por quatro contextos. Colocá-los dentro de
  "operações" faria orçamento e DRE dependerem de operações — acoplamento
  errado.

### 3.3 Operações Financeiras
Módulo: `financial-operations`.

- **Responsabilidade:** registrar o que a empresa deve e o que tem a receber,
  seu ciclo de vida (rascunho → pendente → pago; a receber → recebido), e a
  cobrança de atrasados.
- **Possui:** `Payable`, `PayableInstallment`, `Receivable`,
  `ReceivableInstallment`, `RecurrenceRule`, `Supplier`, `Customer`,
  `CollectionContact` (registro de contato de cobrança), `Attachment` (via
  serviço compartilhado de arquivos), `Settlement` (registro de pagamento/
  recebimento com juros, multa, desconto).
- **Consome:** categorias e centros de custo (estrutura), contas financeiras
  (bancos) — por **identificador**, não por junção direta.
- **Publica:** `PayableCreated`, `PayableSettled`, `PayableApproved`,
  `ReceivableSettled`, `ReceivableOverdue`, `PayableDeleted`, etc.
- **Regra central:** ao marcar como pago/recebido, o contexto emite
  `…Settled`; o contexto **Bancos** reage criando a movimentação financeira
  que altera o saldo realizado. Operações **não** escreve saldo.
- **Não faz:** não emite documento fiscal; não envia cobrança automática
  (registro apenas no MVP); não calcula fluxo de caixa.

### 3.4 Faturamento
Módulo: `billing`.

- **Responsabilidade:** documentos de cobrança internos (fatura/cobrança com
  vencimento, referência de pagamento, recibo).
- **Possui:** `Invoice` (documento de cobrança gerencial), `PaymentReference`
  (PIX copia-e-cola, linha digitável — via adaptadores futuros), `Receipt`.
- **Consome:** recebíveis (uma fatura gera/vincula recebíveis).
- **Fronteira preparada:** `FiscalDocumentProvider` (NF-e/NFS-e) e
  `PaymentReferenceProvider` (PIX/boleto) como portas sem implementação real
  no MVP além de um adaptador "manual".
- **Não faz:** motor fiscal. Nunca.

### 3.5 Bancos
Módulo: `banking`.

- **Responsabilidade:** contas financeiras (banco, conta de pagamento, caixa),
  saldos, movimentações realizadas, extratos importados.
- **Possui:** `FinancialAccount` (com subtipo banco/pagamento/caixa),
  `FinancialTransaction` (movimentação realizada: entrada/saída/transferência),
  `BankStatement`, `BankStatementEntry`, `OpeningBalance`.
- **Consome:** eventos `…Settled` de operações (cria movimentações);
  arquivos interpretados pelo contexto de integrações.
- **Publica:** `TransactionRecorded`, `StatementImported`.
- **Regra central:** o **saldo realizado** de uma conta é derivado das
  movimentações a partir do saldo inicial. É um cálculo determinístico,
  reproduzível e testável.
- **Não faz:** conciliação (contexto próprio); scraping bancário (nunca);
  projeção (tesouraria).

### 3.6 Conciliação
Módulo: `reconciliation`.

- **Responsabilidade:** casar linhas de extrato com movimentações/lançamentos,
  sugerir correspondências com nível de confiança, registrar decisões humanas.
- **Possui:** `ReconciliationSession`, `ReconciliationMatch` (com
  `confidence: alta | possível | revisão` e `decidedBy`), `MatchingRule`
  (regras por fornecedor/descrição aprendidas a partir das decisões).
- **Consome:** `BankStatementEntry` (bancos), `FinancialTransaction`
  (bancos), `Payable`/`Receivable` pendentes (operações) — por leitura via
  contratos.
- **Publica:** `EntryReconciled`, `EntryIgnored`,
  `TransactionCreatedFromStatement`.
- **Regra central:** nada com confiança abaixo de "alta" é conciliado sem
  confirmação humana; mesmo "alta" só é aplicada em lote com pré-visualização.

### 3.7 Tesouraria
Módulo: `treasury`.

- **Responsabilidade:** responder "tem dinheiro suficiente, no lugar certo e
  na hora certa": posição de caixa, fluxo de caixa (diário/semanal/mensal)
  separando realizado de previsto, projeção (7/30/90 dias), capital de giro,
  dívidas e detecção de déficit projetado.
- **Possui:** `Debt`, `DebtInstallment`, `CashForecastSnapshot` (opcional,
  para histórico de projeções), `TreasuryAssumption` (premissas explícitas
  usadas na projeção).
- **Consome (somente leitura):** saldos e movimentações (bancos), pagáveis e
  recebíveis pendentes e recorrências (operações).
- **Publica:** `ProjectedCashDeficitDetected` (consumido por notificações e
  análises).
- **Regra central:** toda projeção lista as premissas e os lançamentos que a
  compõem. Nunca esconde o cálculo.
- **Não faz:** não altera lançamentos; não decide nada.

### 3.8 Orçamento
Módulo: `budget`.

- **Responsabilidade:** orçamentos por período (mês), categoria, centro de
  custo e fonte de receita.
- **Possui:** `Budget`, `BudgetLine`.
- **Consome:** estrutura financeira.
- **Consumido por:** controle gerencial (orçado × realizado).
- **Não faz:** não calcula o realizado (isso é do controle gerencial, que tem
  o motor de cálculo).

### 3.9 Controle Gerencial
Módulo: `management-control`.

- **Responsabilidade:** o **motor de cálculo financeiro** do produto — DRE
  gerencial (competência e caixa), custos, margens, orçado × realizado, KPIs.
  Todas as fórmulas vivem aqui, uma vez, com testes e exemplos.
- **Possui:** `DreStructure` (personalização), `KpiDefinition`,
  `CalculationSnapshot` (resultados materializados por período, quando
  necessário para performance).
- **Consome (somente leitura):** lançamentos classificados (operações),
  movimentações (bancos), orçamentos (orçamento), estrutura.
- **Publica:** `BudgetVarianceExceeded`, `MarginDropped` (regras
  determinísticas que viram "pontos de atenção").
- **Regra central:** funções puras e determinísticas —
  `calcularMargemBruta()`, `calcularMargemContribuicao()`,
  `calcularPosicaoCaixa()`, `calcularVariacaoOrcamento()`,
  `calcularCaixaProjetado()`, `calcularPontoEquilibrio()` — cada uma com
  definição, entradas, fórmula, casos de borda e testes. Componentes de
  interface **nunca** reimplementam fórmulas.
- **Nota:** a posição de caixa e a projeção são calculadas aqui e expostas à
  tesouraria; a tesouraria é a "dona" da apresentação e das premissas, o
  motor é o dono da matemática. Isso evita duas implementações do mesmo
  cálculo.

### 3.10 Análises (IA)
Módulo: `ai-insights`.

- **Responsabilidade:** transformar resultados calculados em pontos de
  atenção, respostas a perguntas de negócio e cenários — via
  `AIInsightProvider` substituível.
- **Possui:** `AIAnalysis` (pergunta, contexto estruturado enviado, resposta
  em blocos, provedor, modelo, custo), `AIScenario` (premissas ajustadas e
  resultado recalculado pelo motor), `AttentionPoint` (gerado por regra,
  sem IA).
- **Consome (somente leitura):** saídas do motor de cálculo e da tesouraria,
  já agregadas e anonimizadas quando envolvem pessoas.
- **Regra central:** a IA recebe **números já calculados** e devolve
  interpretação nos blocos Conclusão · Dados usados · Premissas · Cálculo ·
  Incerteza · Cenários. Nunca recebe dados pessoais sensíveis de funcionários
  nem produz valores financeiros próprios. Nunca recomenda decisão nominal de
  pessoal.

### 3.11 Integrações
Módulo: `integrations`.

- **Responsabilidade:** todas as portas de entrada e saída de dados externos —
  o **pipeline genérico de importação** (enviar → interpretar → validar →
  pré-visualizar → duplicidades → erros → confirmar → gravar → auditar) e os
  adaptadores.
- **Possui:** `ImportJob`, `ImportRow`, `SourceFingerprint`,
  `IntegrationConnection` (futuro: Open Finance, APIs).
- **Contratos:** `InputProvider` (manual, CSV, XLSX, OFX, QR, NFC, Bluetooth,
  API), `BankStatementProvider` (OFX, CSV, Open Finance A/B, API direta),
  `FiscalDocumentProvider`, `PaymentReferenceProvider`.
- **Regra central:** adicionar um provedor **nunca** altera o núcleo
  financeiro (Aberto/Fechado). O núcleo depende dos contratos; os adaptadores
  dependem do núcleo.

### 3.12 Auditoria
Módulo: `audit`.

- **Responsabilidade:** trilha imutável de eventos relevantes.
- **Possui:** `AuditEvent` (usuário, organização, ação, timestamp, valor
  anterior, valor novo, recurso, origem do dado, metadados de segurança
  justificados).
- **Consome:** eventos de domínio de todos os contextos.
- **Regra central:** somente inserção (append-only). Usuários comuns não
  editam nem apagam auditoria.

### 3.13 Notificações
Módulo: `notifications`.

- **Responsabilidade:** entregar alertas (no app, e-mail; outros canais por
  adaptador `NotificationSender`).
- **Possui:** `Notification`, `NotificationPreference`.
- **Consome:** eventos como `ReceivableOverdue`, `ProjectedCashDeficitDetected`,
  `PayableAwaitingApproval`.

### 3.14 Relatórios
Módulo: `reports`.

- **Responsabilidade:** consultas de leitura otimizadas, exportações (CSV, PDF
  simples) e a busca global.
- **Não possui** entidades de negócio; possui definições de relatório e
  modelos de exportação.
- **Nota:** relatórios leem via contratos de consulta dos contextos donos, ou
  via *views* de leitura mantidas pelos próprios contextos. Nunca escrevem.

### 3.15 Configurações
Módulo: `settings`.

- **Responsabilidade:** preferências da organização (segregação de funções
  ligada/desligada, regime padrão de visualização, retenção de dados,
  fuso, formato), preferências do usuário.
- **Possui:** `OrganizationSettings`, `UserPreferences`.

### 3.16 Licenciamento (fora do domínio financeiro)
Módulo: `licensing`.

- **Responsabilidade:** versão do produto instalada, licença ativa,
  capacidades comerciais habilitadas (módulos, integrações, IA).
- **Possui:** `License`, `ProductVersion`, `EnabledCapability`.
- **Contrato exposto:** `FeatureGate.isEnabled(feature)`.
- **Regra central:** o domínio financeiro **não** conhece licenças. Ele
  consulta `FeatureGate`. As regras comerciais podem mudar sem tocar no
  financeiro.

## 4. Núcleo compartilhado (shared kernel)

Pequeno, estável e sem regras de negócio:

| Elemento | Definição |
|---|---|
| `Money` | `{ amount: Decimal, currency: 'BRL' \| … }`. Aritmética decimal. Nunca `number`. |
| Datas financeiras | Tipos distintos e nunca sobrepostos: `competenceDate`, `dueDate`, `expectedDate`, `paymentDate`, `receiptDate`, `createdAt`. Datas de negócio são **datas civis** (sem hora, sem fuso); timestamps de sistema são UTC. |
| `OrganizationId`, `UserId` | Identificadores opacos. |
| `DomainEvent` | `{ name, organizationId, occurredAt, actorUserId, payload }`. |
| `Result<T, DomainError>` | Erros de domínio são valores, não exceções. Mensagens ao usuário em pt-BR e sem vazamento técnico. |
| Paginação | Cursor ou offset padronizado para listas do servidor. |

## 5. Regras de dependência entre módulos

1. **Identidade e Acesso** e **Núcleo compartilhado** podem ser usados por
   todos.
2. **Estrutura Financeira** é usada por Operações, Bancos, Orçamento, Controle
   Gerencial. Não usa nenhum deles.
3. **Operações** usa Estrutura e Bancos (por identificador). Não usa
   Tesouraria, Controle Gerencial, Análises.
4. **Bancos** usa Estrutura. Reage a eventos de Operações. Não chama
   Operações.
5. **Conciliação** lê Bancos e Operações. Escreve apenas em si mesma e emite
   eventos que Bancos/Operações consomem.
6. **Tesouraria**, **Controle Gerencial** e **Orçamento** são leitores dos
   contextos operacionais. Não escrevem neles.
7. **Análises** lê apenas Controle Gerencial e Tesouraria. Nunca lê tabelas
   operacionais diretamente.
8. **Transversais** (auditoria, notificações, relatórios, integrações,
   configurações) reagem a eventos e expõem serviços; o domínio financeiro não
   depende deles para validar regras — com uma exceção deliberada: o pipeline
   de importação (integrations) chama os serviços de aplicação de Bancos e
   Operações para gravar, nunca as tabelas.
9. **Licenciamento** só é conhecido pela camada de aplicação via
   `FeatureGate`. Nenhuma entidade de domínio referencia licença.
10. **Interface (UI)** só conversa com a camada de aplicação de cada módulo.
    Nunca com repositórios.

Violações dessas regras devem ser detectadas por lint de dependências no
Gate 5 (ex.: regra de importação por caminho).

## 6. Invariantes de domínio (regras que nunca podem ser quebradas)

| # | Invariante | Contexto |
|---|---|---|
| I1 | Todo registro de negócio tem `organizationId` e toda consulta filtra por ele no servidor. | Todos |
| I2 | Valores monetários são decimais com moeda. Nunca ponto flutuante. | Núcleo |
| I3 | Um pagável/recebível só pode ser "pago"/"recebido" com data de pagamento/recebimento, valor e conta financeira. | Operações |
| I4 | Marcar como pago gera exatamente uma movimentação financeira (ou uma por parcela); desfazer a remove e restaura o status. | Operações + Bancos |
| I5 | Saldo realizado = saldo inicial + Σ movimentações realizadas até a data. Nunca é um campo editável à mão. | Bancos |
| I6 | Uma linha de extrato é conciliada com no máximo um conjunto de movimentações e uma movimentação com no máximo uma linha (n:1 permitido para agrupamentos explícitos). | Conciliação |
| I7 | Nenhuma conciliação com confiança < alta é aplicada sem decisão humana registrada. | Conciliação |
| I8 | Importação é atômica: ou grava todas as linhas confirmadas ou nenhuma. Reimportar o mesmo arquivo não duplica. | Integrações |
| I9 | Exclusão de registro financeiro é lógica (lixeira) e auditada. Exclusão física só por rotina de retenção (LGPD). | Todos |
| I10 | Quando a segregação está ativa, `createdBy ≠ approvedBy`. | Operações |
| I11 | A DRE gerencial soma exatamente os lançamentos classificados do período; lançamentos sem categoria aparecem em "Não classificado". Nada some. | Controle Gerencial |
| I12 | Toda projeção de caixa lista as premissas e os lançamentos usados. | Tesouraria |
| I13 | A IA nunca é fonte de valor financeiro. Toda resposta referencia os cálculos do motor. | Análises |
| I14 | Auditoria é somente inserção. | Auditoria |
| I15 | Nenhum dado pessoal sensível de funcionário é enviado ao provedor de IA. | Análises |

## 7. Ciclos de vida (máquinas de estado)

### Conta a pagar
```
rascunho ──▶ pendente ──▶ agendado ──▶ pago
   │            │            │
   │            ├────────────┴──▶ vencido ──▶ pago
   │            │
   ▼            ▼
cancelado    cancelado

(com segregação ativa)
rascunho ──▶ aguardando aprovação ──▶ pendente …
                     │
                     └──▶ rascunho (recusado, com comentário)
```
- `vencido` é um estado **derivado** (pendente/agendado com `dueDate` <
  hoje), não um estado gravado — evita rotinas noturnas para "marcar vencidos"
  e garante que a lista está sempre correta. Na interface aparece como
  status; no domínio é uma função.
- `pago` pode voltar a `pendente` via "Desfazer pagamento" (auditado).

### Conta a receber
```
a receber ──▶ parcialmente recebido ──▶ recebido
    │                  │
    ├──▶ atrasado (derivado) ──▶ recebido / parcialmente recebido
    │
    ▼
cancelado
```

### Linha de extrato
```
importada ──▶ sugerida (alta | possível | revisão) ──▶ conciliada
                              │
                              ├──▶ ignorada (com motivo)
                              └──▶ nova movimentação criada ──▶ conciliada
```

### Importação
```
enviada ──▶ interpretada ──▶ validada ──▶ pré-visualizada ──▶ confirmada ──▶ gravada
                │                │                                 │
                └──▶ falhou      └──▶ falhou                       └──▶ falhou (nada gravado)
gravada ──▶ revertida (se nenhuma linha conciliada)
```

## 8. Glossário

Ver `docs/produto/05-glossario.md`. Os nomes técnicos (em inglês, no código)
e os rótulos de interface (em pt-BR) são definidos lá e valem para todo o
sistema.
