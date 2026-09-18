# Jornadas do Usuário

> Gate 1 — Produto e Domínio · Documento 3 de 6

Cada jornada descreve: persona, gatilho, passos, resultado esperado, critérios
de sucesso e pontos de risco. As jornadas J1 a J8 são obrigatórias no MVP.
J9 a J11 são estruturais (o modelo de dados as prevê) mas podem ter interface
simplificada na primeira versão.

Convenção de rótulos de ação usada nas jornadas (ver também `05-glossario.md`):
"Adicionar conta", "Marcar como pago", "Confirmar recebimento", "Importar
extrato", "Conciliar", "Criar orçamento", "Comparar com realizado".

---

## J1 — Primeiro acesso e configuração da empresa

**Persona:** Márcia (ou Rafael, delegado por ela).
**Gatilho:** Licença adquirida; instância instalada ou hospedada.

**Passos.**
1. Criar conta (e-mail + senha) ou "Continuar com Google".
2. Criar a empresa: nome, CNPJ (opcional no MVP, mas recomendado para
   detecção de duplicidade futura), regime simples de tributação apenas como
   rótulo informativo (não há motor fiscal).
3. Adicionar a primeira conta financeira: banco ou caixa, com saldo inicial e
   data do saldo inicial.
4. Escolher um **modelo de categorias** pronto (comércio, serviços, indústria)
   — editável depois. O modelo já vem com a estrutura de DRE gerencial padrão.
5. Opcional: importar clientes e fornecedores via CSV.
6. Opcional: importar o primeiro extrato (OFX/CSV).
7. Chegar à tela **Hoje** com um estado vazio útil: "Adicione sua primeira
   conta a pagar" / "Importe um extrato".

**Resultado:** empresa configurada em menos de 10 minutos, sem consultar
manual.

**Critérios de sucesso.**
- O usuário nunca vê um campo que não entende sem uma explicação de uma linha.
- Nada é obrigatório além de: nome da empresa e uma conta financeira.
- O modelo de categorias pode ser trocado antes do primeiro lançamento.

**Riscos.**
- Saldo inicial errado contamina toda a posição de caixa. Mitigação: o saldo
  inicial é um lançamento auditável e editável, e a conciliação do primeiro
  extrato o confirma.

---

## J2 — Rotina diária: "O que eu preciso fazer hoje?"

**Persona:** Márcia (consulta), Rafael (execução).
**Gatilho:** Início do expediente.

**Passos.**
1. Abrir o sistema. A primeira tela é **Hoje**.
2. Ver, nesta ordem:
   1. Contas que precisam de atenção (vencidas, vencendo hoje, aguardando
      aprovação).
   2. Recebimentos esperados hoje.
   3. Saldo disponível (por conta e consolidado).
   4. Pendências (lançamentos de extrato não conciliados, importações
      incompletas, duplicidades suspeitas).
   5. Situação financeira resumida (entradas previstas, saídas previstas,
      resultado do mês até agora).
3. Agir diretamente da lista: "Marcar como pago", "Confirmar recebimento",
   "Ver conciliação".
4. Se houver alertas ("Possível falta de caixa em 12 dias"), abrir e ver quais
   lançamentos geram a projeção.

**Resultado:** o usuário sabe em ~10 segundos o que fazer e age sem trocar de
tela.

**Critérios de sucesso.**
- As seis perguntas do dashboard (quanto tenho, quanto entra, quanto sai, o
  que vence, há problema, como está performando) são respondidas na primeira
  dobra.
- Nenhum texto longo de IA na tela Hoje — apenas o indicador discreto
  "N pontos merecem atenção".

---

## J3 — Registrar uma conta a pagar (com recorrência e parcelas)

**Persona:** Rafael.
**Gatilho:** Boleto recebido / nota de fornecedor.

**Passos.**
1. Atalho "Adicionar conta" (acessível de qualquer tela e por teclado).
2. Preencher: fornecedor (autocompletar; criar inline se não existir),
   descrição, valor, vencimento, categoria (sugerida a partir do histórico do
   fornecedor), centro de custo (opcional).
3. Opcional, sob demanda: data de competência (padrão = vencimento),
   recorrência (mensal, semanal, anual, personalizada), parcelamento (N
   parcelas; o sistema gera as parcelas com datas e valores e mostra
   pré-visualização), forma de pagamento, conta financeira, anexo, observações,
   número do documento.
4. O sistema verifica **duplicidade provável** (mesmo fornecedor + valor +
   vencimento próximos, ou mesmo número de documento) e avisa antes de salvar.
5. Salvar. A conta nasce como **pendente** (ou **rascunho**, se faltar valor ou
   vencimento; ou **aguardando aprovação**, se a segregação de funções estiver
   ativa).
6. Feedback: "Conta adicionada" com ação "Desfazer" por alguns segundos.

**Resultado:** conta registrada em ≤ 20 segundos no caso comum.

**Critérios de sucesso.**
- Campos obrigatórios: descrição ou fornecedor, valor, vencimento. Só isso.
- Recorrência e parcelas nunca gravam sem pré-visualização.
- Duplicidade suspeita é sinalizada, nunca bloqueada silenciosamente nem
  descartada automaticamente.

**Espelho:** J3-R — Registrar uma conta a receber segue o mesmo padrão, com
cliente no lugar de fornecedor, "data prevista de recebimento" e status
inicial **a receber**.

---

## J4 — Marcar como pago / Confirmar recebimento

**Persona:** Rafael.
**Gatilho:** Pagamento efetuado no banco ou recebimento confirmado.

**Passos.**
1. Na lista ou na tela Hoje, escolher "Marcar como pago".
2. Confirmar/ajustar: data de pagamento (padrão = hoje), valor pago (padrão =
   valor da conta; permite juros/multa/desconto com campos separados), conta
   financeira, forma de pagamento.
3. Para recebimentos: permitir **recebimento parcial** (o saldo restante
   permanece "parcialmente recebido").
4. Salvar. O sistema cria a **movimentação financeira** correspondente na conta
   financeira, o que altera o saldo realizado.
5. Feedback com "Desfazer".

**Resultado:** o lançamento reflete a realidade; o saldo realizado é
atualizado; o lançamento fica disponível para conciliação com o extrato.

**Critérios de sucesso.**
- A ação nunca é otimista: a interface só mostra "pago" após confirmação do
  servidor.
- Juros, multa e desconto são registrados separadamente, não escondidos no
  valor.
- Desfazer reverte a movimentação e restaura o status anterior, com auditoria.

---

## J5 — Importar extrato e conciliar

**Persona:** Rafael.
**Gatilho:** Fechamento semanal / diário do banco.

**Passos.**
1. "Importar extrato" → escolher conta financeira → enviar arquivo (OFX ou
   CSV; XLSX quando seguro).
2. O sistema executa o pipeline: **enviar → interpretar → validar →
   pré-visualizar → identificar duplicidades → mostrar erros → confirmar →
   gravar → auditar**.
3. Na pré-visualização: linhas válidas, linhas com erro (data inválida, valor
   ilegível), linhas já importadas antes (por identificador do banco ou
   impressão digital do arquivo/linha). O usuário decide o que confirmar.
4. Após gravar, a **fila de conciliação** mostra cada lançamento do extrato com
   uma sugestão e um nível de confiança:
   - **Correspondência alta** — mesmo valor, data próxima, fornecedor/cliente
     reconhecido.
   - **Possível correspondência** — valor igual, mas data ou contraparte
     divergente.
   - **Revisão necessária** — sem sugestão confiável.
5. O usuário pode: aceitar sugestão, escolher outro lançamento, criar um novo
   lançamento a partir da linha do extrato ("isso é uma tarifa bancária"),
   ou ignorar a linha (com motivo).
6. Ações em lote ("Aceitar todas as correspondências altas") exigem
   pré-visualização e confirmação única.

**Resultado:** o saldo do sistema bate com o saldo do banco; divergências são
explícitas.

**Critérios de sucesso.**
- Nenhuma conciliação acontece silenciosamente para "Possível correspondência"
  ou "Revisão necessária".
- Reimportar o mesmo arquivo não cria duplicatas (idempotência).
- Erro no meio da importação não deixa registros parciais: "Não foi possível
  importar o extrato. Nenhum lançamento foi alterado."

---

## J6 — Cobrar um cliente atrasado

**Persona:** Rafael (executa), Márcia (acompanha).
**Gatilho:** Conta a receber passou do vencimento.

**Passos.**
1. Tela **Cobranças**: lista de recebíveis atrasados com cliente, valor em
   atraso, dias de atraso, último contato, próxima ação.
2. Abrir um cliente: ver histórico de pagamentos (paga em dia? atrasa sempre?)
   e as parcelas em aberto.
3. Registrar um contato: canal (telefone, WhatsApp, e-mail — apenas registro
   no MVP, sem envio automático), resumo, próxima ação e data.
4. Quando o cliente paga: "Confirmar recebimento" direto daqui (J4).
5. Opcional: renegociar — gerar novas parcelas a partir do saldo em aberto,
   cancelando as originais com vínculo de rastreabilidade.

**Resultado:** ninguém precisa "lembrar" de cobrar; a lista diz quem, quanto e
qual é o próximo passo.

**Critérios de sucesso.**
- Não vira CRM: sem funil, sem pipeline, sem campanhas.
- O histórico de contatos é auditável.

---

## J7 — Fechar o mês: DRE gerencial e orçado × realizado

**Persona:** Juliana, Márcia.
**Gatilho:** Virada do mês.

**Passos.**
1. Abrir **Resultados** → mês anterior.
2. Ver a DRE gerencial: Receita Bruta → Deduções → Receita Líquida → Custos →
   Lucro Bruto → Despesas Operacionais → Resultado Operacional → Resultado
   Financeiro → Resultado Gerencial. Cada linha abre para as categorias que a
   compõem.
3. Alternar entre **regime de competência** e **regime de caixa** com rótulo
   claro do que está sendo mostrado.
4. Ver margens (bruta, de contribuição quando houver dados, operacional,
   gerencial) em % e em R$, com explicação "O que é isso? / Como é calculado? /
   Por que importa?".
5. Abrir **Orçamento** → "Comparar com realizado": por categoria e centro de
   custo, com variação em R$ e %, e indicação de favorável/desfavorável
   conforme o tipo (despesa acima do orçado = desfavorável; receita acima do
   orçado = favorável).
6. Ver pendências que afetam o fechamento: lançamentos sem categoria, linhas
   de extrato não conciliadas, contas vencidas sem baixa.
7. Opcional: exportar (CSV/PDF simples no MVP).

**Resultado:** o dono entende o resultado do mês sem contador.

**Critérios de sucesso.**
- A DRE aparece sempre como "DRE Gerencial", nunca como demonstração contábil
  oficial (aviso permanente e discreto).
- Um lançamento sem categoria nunca "some" da DRE: aparece em "Não
  classificado" com chamada para ação.

---

## J8 — Perguntar ao Assistente Financeiro

**Persona:** Márcia, Juliana.
**Gatilho:** Dúvida de negócio ("o caixa aguenta contratar mais uma pessoa?")
ou indicador "3 pontos merecem atenção" no dashboard.

**Passos.**
1. Abrir **Análises**.
2. Ver os pontos de atenção gerados automaticamente a partir de regras
   determinísticas (ex.: "Despesas com marketing 32% acima do orçado";
   "Prazo médio de recebimento subiu de 28 para 41 dias").
3. Fazer uma pergunta em linguagem natural ou escolher uma pergunta sugerida.
4. Receber uma resposta estruturada em blocos fixos:
   **Conclusão · Dados usados · Premissas · Cálculo · Incerteza · Cenários
   possíveis.**
5. Para cenários ("e se as vendas caírem 10%?"), ajustar premissas e ver o
   recálculo — feito pelo motor de cálculo do sistema, não pela IA.

**Resultado:** o usuário sai com um entendimento e opções, não com uma ordem.

**Critérios de sucesso.**
- Nenhum número na resposta vem do modelo de linguagem: todos vêm do motor de
  cálculo e são referenciados.
- A IA nunca recomenda demissão nominal ou usa dados pessoais sensíveis;
  análises de pessoal usam folha agregada, capacidade e produtividade.
- Se o provedor de IA estiver indisponível, os pontos de atenção
  determinísticos continuam funcionando.

---

## J9 — Aprovar um pagamento (segregação de funções)

**Persona:** Rafael registra, Beto aprova.
**Gatilho:** Segregação de funções ativada nas configurações da empresa
(opcional; desligada por padrão em empresas com um único usuário).

**Passos.**
1. Rafael registra a conta (J3). Ela nasce como **aguardando aprovação**.
2. Beto recebe notificação, abre no celular, vê: fornecedor, valor,
   vencimento, categoria, anexo, quem registrou.
3. Aprova (→ **pendente**, pronta para pagamento) ou recusa com comentário
   (→ volta a **rascunho** para Rafael corrigir).
4. Ação sensível: pode exigir reautenticação.

**Critérios de sucesso.**
- Quem registrou não pode aprovar o próprio lançamento quando a segregação
  está ativa.
- O sistema distingue as etapas **registro → aprovação → execução
  (pagamento) → conciliação** e registra quem fez cada uma.

---

## J10 — Recuperar-se de um erro

**Persona:** Rafael.
**Gatilho:** "Excluí a conta errada" / "Marquei como pago sem querer" /
"Importei o arquivo errado".

**Passos.**
1. Ações recentes oferecem "Desfazer" imediato.
2. Exclusões vão para a **Lixeira** (exclusão lógica) e podem ser restauradas.
3. Uma importação inteira pode ser revertida como unidade, desde que seus
   lançamentos ainda não tenham sido conciliados (se tiverem, o sistema mostra
   o que impede e como proceder).
4. O **Histórico** de cada lançamento mostra quem alterou, quando, valor
   anterior e valor novo.

**Critérios de sucesso.**
- Exclusão em massa mostra "Você está prestes a excluir 48 lançamentos" e
  exige segunda confirmação deliberada.
- Ações pequenas não têm confirmação dupla (evitar fadiga de confirmação).

---

## J11 — Convidar um usuário e definir seu papel

**Persona:** Márcia.
**Gatilho:** Nova pessoa na equipe; contador externo precisa consultar.

**Passos.**
1. Configurações → Usuários → "Convidar usuário".
2. Informar e-mail e papel: **Administrador**, **Financeiro**, **Gestor**,
   **Consulta**.
3. O convidado recebe e-mail, cria conta (ou usa a existente, no caso do BPO)
   e passa a ter vínculo com a organização.
4. Márcia pode revogar o acesso a qualquer momento; a revogação encerra as
   sessões do usuário naquela organização.

**Critérios de sucesso.**
- Papéis são conjuntos de capacidades (ex.: `accounts_payable.create`), e a
  política de autorização é centralizada — nunca espalhada pela interface.
- Um usuário pode pertencer a várias organizações com papéis diferentes.

---

## Mapa de jornadas × módulos

| Jornada | Módulos envolvidos |
|---|---|
| J1 | authentication, organizations, users, banking, financial-structure, integrations (importação) |
| J2 | treasury, financial-operations, notifications, reports |
| J3 | financial-operations, financial-structure, audit |
| J4 | financial-operations, banking (movimentação), audit |
| J5 | integrations (importação), banking, reconciliation, audit |
| J6 | financial-operations (cobrança) |
| J7 | management-control, budget, reports |
| J8 | ai-insights, management-control, treasury |
| J9 | financial-operations, users (papéis), notifications, audit |
| J10 | audit, financial-operations, integrations |
| J11 | users, organizations, authentication, notifications |
