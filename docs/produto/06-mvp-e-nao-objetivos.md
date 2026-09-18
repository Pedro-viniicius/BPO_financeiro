# Definição do MVP e Não-Objetivos

> Gate 1 — Produto e Domínio · Documento 6 de 6

## 1. Critério de corte

O MVP é o menor produto que percorre a cadeia completa
**Dado → Registro → Organização → Conciliação → Controle → Indicador →
Análise → Decisão humana** para uma empresa com uma ou mais contas bancárias,
usando entrada manual e importação de extrato.

Tudo que não é necessário para percorrer essa cadeia uma vez, de ponta a
ponta, com segurança, fica para a Fase 2 ou posterior — mesmo que já esteja
"desenhado" no domínio.

## 2. Escopo do MVP (Fase 1)

Legenda de prioridade: **P0** = sem isso não lança · **P1** = necessário para
o primeiro cliente pagante · **P2** = entra no MVP se não atrasar o P0/P1.

### 2.1 Fundação (Gate 5)

| Item | Prioridade | Critérios de aceite |
|---|---|---|
| Autenticação e-mail + senha | P0 | Hash forte, política de senha, bloqueio por tentativas, recuperação segura por e-mail. |
| "Continuar com Google" (OAuth/OIDC) | P1 | Um único conceito de login social; vínculo com conta existente por e-mail verificado. |
| MFA/TOTP opcional + códigos de recuperação | P1 | Ativável por usuário; exigível pela empresa para administradores. |
| Sessões seguras | P0 | Cookies HttpOnly/Secure/SameSite; revogação; reautenticação para ações sensíveis. |
| Empresa (organização) e configuração inicial | P0 | J1 concluída em < 10 min; isolamento por organização em toda consulta. |
| Usuários, convites, papéis (Administrador, Financeiro, Gestor, Consulta) | P0 | Política de autorização centralizada por capacidade; testes de isolamento de tenant. |
| Auditoria básica | P0 | Eventos de criação/alteração/exclusão/baixa/conciliação com valor anterior e novo. Append-only. |
| Lixeira e desfazer | P1 | Exclusão lógica em todos os registros financeiros; desfazer para baixa e exclusão. |
| Licenciamento por versão (`FeatureGate`) | P1 | Domínio financeiro não referencia licença. Instalação sem chave externa funciona no modo padrão (a definir no Gate 2). |
| Testes e CI | P0 | Unitários (regras), integração (repositórios, isolamento), E2E dos fluxos críticos. |

### 2.2 Operação Financeira (Gate 6)

| Item | Prioridade | Critérios de aceite |
|---|---|---|
| Clientes e fornecedores | P0 | Cadastro mínimo (nome; CPF/CNPJ, contato opcionais); criação inline; busca tolerante a formatação. |
| Categorias e centros de custo | P0 | Modelos por segmento; hierarquia grupo → categoria; mapeamento para linha da DRE. |
| Contas a pagar | P0 | J3 completa: campos, status, recorrência, parcelas com pré-visualização, anexo, duplicidade sinalizada. |
| Contas a receber | P0 | Espelho de J3 com recebimento parcial. |
| Marcar como pago / Confirmar recebimento | P0 | J4: juros/multa/desconto separados; gera movimentação; desfazer. |
| Aprovação de pagamento (segregação de funções) | P2 | Configurável por empresa; `createdBy ≠ approvedBy`; interface simples. |
| Cobranças (gestão de atrasados) | P1 | J6: lista de atrasados, histórico, registro de contato, próxima ação. Sem envio automático. |
| Documentos de cobrança internos | P2 | Fatura/cobrança gerencial e recibo em PDF simples; PIX/boleto apenas via adaptador manual (usuário cola a referência). |
| Importação CSV de clientes/fornecedores | P1 | Pipeline padrão de importação com pré-visualização. |

### 2.3 Tesouraria (Gate 7)

| Item | Prioridade | Critérios de aceite |
|---|---|---|
| Contas financeiras (banco, pagamento, caixa) + saldo inicial | P0 | Saldo derivado, nunca editável à mão. |
| Movimentações e transferências | P0 | Transferência não é receita/despesa. |
| Importação de extrato OFX | P0 | Pipeline completo; idempotente por FITID e impressão digital. |
| Importação de extrato CSV | P0 | Mapeamento de colunas guiado, salvo por conta para reuso. |
| Importação XLSX | P2 | Apenas leitura de planilha simples, com os mesmos limites de segurança do CSV. |
| Conciliação assistida | P0 | J5: três níveis de confiança; nada abaixo de "alta" sem decisão humana; lote com pré-visualização; "criar a partir do extrato"; ignorar com motivo. |
| Posição de caixa | P0 | Saldo por conta, consolidado, entradas/saídas de hoje. |
| Fluxo de caixa diário/semanal/mensal | P0 | Realizado e previsto sempre distinguíveis (não só por cor). |
| Projeção 7/30/90 dias | P1 | Lista premissas e lançamentos; detecção de falta de caixa com valor e dia. |
| Capital de giro (indicadores simples) | P2 | Prazo médio de recebimento e pagamento; explicação em linguagem simples. |
| Alertas básicos | P1 | Contas vencidas, recebimentos atrasados, falta de caixa prevista, desvio de orçamento. |

### 2.4 Controle Gerencial (Gate 8)

| Item | Prioridade | Critérios de aceite |
|---|---|---|
| DRE gerencial (competência e caixa) | P0 | Estrutura padrão personalizável; drill-down por categoria; "Não classificado" visível; aviso "gerencial, não oficial". |
| Margens básicas (bruta, operacional, gerencial) | P0 | % e R$; explicação em três perguntas. |
| Margem de contribuição | P2 | Só quando houver classificação fixo/variável suficiente; caso contrário, mostra "o que falta" para calcular. |
| Orçamento mensal por categoria/centro de custo | P1 | Criação rápida a partir do realizado de meses anteriores. |
| Orçado × realizado | P1 | J7: variação em R$ e %; favorável/desfavorável por tipo. |
| Indicadores (KPI) contextuais | P1 | Receita, despesas, caixa, atrasados, a pagar, margem bruta, resultado, variação de orçamento. Não todos ao mesmo tempo. |
| Dashboard | P0 | Responde as seis perguntas em ~10 s; quatro gráficos no máximo; indicador discreto "N pontos merecem atenção". |
| Exportação CSV / PDF simples | P1 | DRE, fluxo de caixa, listas. |

### 2.5 Análises (Gate 9)

| Item | Prioridade | Critérios de aceite |
|---|---|---|
| Pontos de atenção determinísticos | P1 | Regras sobre saídas do motor de cálculo; funcionam sem provedor de IA. |
| Perguntas ao Assistente sobre dados estruturados | P1 | Resposta em blocos fixos; todo número referenciado ao motor; provedor substituível; sem dados pessoais sensíveis. |
| Cenários simples (variação de vendas/preço/custo) | P2 | Recalculados pelo motor; premissas visíveis e editáveis. |

### 2.6 Prontidão para produção (Gate 10)

Revisão de segurança, LGPD (exportação/exclusão de dados, retenção,
documentação de dados coletados), acessibilidade (WCAG), performance,
backup/restauração testados, documentação completa em pt-BR, Docker.

## 3. Fora do MVP — Fase 2 (após validação)

- Automação de cobrança (envio de e-mail/WhatsApp, réguas).
- Projeção avançada (6 e 12 meses, sazonalidade, premissas por cliente).
- Gestão completa de dívidas (calendário, amortização detalhada, simulação).
- Capital de giro avançado (necessidade de capital de giro, ciclo financeiro).
- Open Finance e APIs bancárias diretas (via `BankStatementProvider`).
- Integração PIX/boleto real (via `PaymentReferenceProvider`).
- Dashboards adicionais e relatórios avançados.
- Cenários de IA mais ricos; comparação de alternativas de investimento.

## 4. Fora do MVP — Fases posteriores

- FP&A avançado, rolling forecast.
- Otimização de produção e modelos microeconômicos avançados (programação
  linear, estimativa de demanda). Antes disso: ponto de equilíbrio, margem de
  contribuição, utilização de capacidade, sensibilidade, e-se.
- Integrações de hardware (NFC, Bluetooth, leitores, POS) via `InputProvider`.
- Conectores com ERPs externos.
- Extração de módulos para serviços (IA, integração bancária, notificações,
  importação, relatórios) — somente com evidência concreta.

## 5. Não-objetivos explícitos

Estes itens **não serão construídos**, nem no MVP nem como "extra". Se alguém
pedir, a resposta é uma integração via fronteira ou um "não".

| Não-objetivo | Motivo | O que fazemos em vez disso |
|---|---|---|
| ERP completo (estoque, compras, produção, RH, vendas) | Destruiria a simplicidade; mercado saturado. | Fronteiras de integração para ERPs externos (fase posterior). |
| Motor fiscal NF-e/NFS-e, SPED, apuração de impostos | Complexidade regulatória enorme; existem provedores especializados. | `FiscalDocumentProvider` como porta; impostos entram como categoria de dedução/despesa. |
| Contabilidade oficial (balanço, DRE societária, plano de contas contábil) | O produto é gerencial; contabilidade é do contador. | DRE **gerencial** com aviso permanente; exportação para o contador. |
| CRM (funil, oportunidades, campanhas) | Outro produto. | Cobrança de atrasados com histórico de contato, e só. |
| Folha de pagamento e dados individuais de funcionários | Sensível (LGPD) e fora do foco. | Folha entra como custo agregado por categoria/centro de custo. |
| Scraping bancário (robôs que acessam internet banking) | Inseguro, frágil, viola termos dos bancos. | OFX/CSV agora; Open Finance e APIs oficiais depois. |
| Execução de pagamentos pelo sistema (TED/PIX saindo do software) | Risco operacional e regulatório no MVP. | "Agendado" é informativo; execução real fica para integração bancária futura, com aprovação e reautenticação. |
| IA como fonte de verdade financeira | Princípio inegociável. | IA interpreta números calculados; motor determinístico calcula. |
| IA que recomenda decisões nominais sobre pessoas | Ética e LGPD. | Análises agregadas de folha, capacidade e produtividade; cenários. |
| Multi-moeda funcional no MVP | Sem demanda inicial. | `Money` sempre carrega moeda; padrão BRL; conversão não implementada. |
| Consolidação multiempresa (grupo econômico) | Complexidade de rateio e eliminação. | Um usuário acessa várias empresas separadamente (BPO). |
| Microsserviços desde o início | Custo de infraestrutura e operação incompatível com licença perpétua e cliente que hospeda. | Monólito modular com fronteiras rígidas. |
| Dependência de serviço gerido pelo fornecedor para operar | Incompatível com licença perpétua. | Instalável com Docker + PostgreSQL do cliente; serviços do fornecedor são opcionais e contratados. |
| Web NFC / Web Bluetooth obrigatórios | Compatibilidade de navegador não universal. | Melhorias progressivas opcionais com fallback manual. |
| App nativo (iOS/Android) | Custo e foco. | Web responsivo; mobile prioriza consulta, aprovação, alertas e lançamento simples. |

## 6. Riscos identificados no Gate 1

| Risco | Impacto | Mitigação planejada |
|---|---|---|
| Usuário informa saldo inicial errado | Toda a posição de caixa fica errada | Saldo inicial auditável; conciliação do primeiro extrato o confirma; alerta de divergência. |
| Conciliação sugerir errado com "alta" confiança | Saldo "batendo" com dados errados | Regras conservadoras; lote sempre com pré-visualização; desfazer conciliação; métricas de acerto. |
| Recorrência gerar lançamentos indevidos | Projeção e DRE poluídas | Pré-visualização obrigatória; geração com janela limitada (ex.: 12 meses à frente); edição "desta ocorrência / de todas as futuras". |
| Vocabulário "simples" ser ambíguo para usuários mais técnicos | Confusão em empresas médias | Glossário na interface; termos técnicos ensinados, não escondidos. |
| Modelo de licença perpétua + IA com custo variável | Prejuízo por consumo de API | Consumo de IA é serviço separado; `FeatureGate`; provedor local possível. |
| BPO com muitas empresas lançando na empresa errada | Dados contaminados entre clientes | Organização ativa sempre visível; troca deliberada; auditoria com organização. |
| Escopo crescer durante a implementação | Atraso e perda de simplicidade | Filtro de admissão (cinco perguntas) aplicado em cada gate. |
