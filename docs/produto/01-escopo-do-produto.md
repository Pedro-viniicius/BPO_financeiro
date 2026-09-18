# Escopo do Produto

> Gate 1 — Produto e Domínio · Documento 1 de 6
> Status: proposta para aprovação

## 1. Nome provisório

**Financeiro** (versão comercial: *Financeiro 1.x*).

O nome é provisório e não afeta a arquitetura. O identificador técnico do
produto é `financeiro`.

## 2. Promessa

> **Organizar a operação financeira, mostrar a situação real da empresa e
> transformar dados financeiros em decisões compreensíveis.**

Tudo o que entra no produto precisa servir a essa promessa. O que não serve
fica de fora, mesmo que seja "fácil de fazer".

## 3. Problema que resolvemos

Micro, pequenas e médias empresas brasileiras administram o financeiro com:

| Situação atual | Consequência |
|---|---|
| Planilhas espalhadas | Informação fragmentada, fórmulas quebradas, ninguém sabe qual versão vale |
| Softwares antigos com suporte descontinuado | Medo de perder dados, impossibilidade de evoluir |
| ERPs genéricos com telas cheias de campos | Lançamento lento, erros, dependência de uma única pessoa que "sabe mexer" |
| Assinaturas mensais caras | Custo fixo recorrente sem relação com o valor percebido |
| Relatórios que mostram números, não entendimento | O dono recebe uma tabela e continua sem saber o que fazer |

O resultado é o mesmo em todos os casos: **o dono não sabe, com confiança,
quanto dinheiro tem, quanto vai entrar, quanto vai sair e se a empresa está
dando resultado.**

## 4. As três camadas do produto

O produto é organizado em três camadas interligadas. Cada uma responde a uma
pergunta de negócio.

### Camada 1 — Operação Financeira
**Pergunta:** "O dinheiro entrou ou saiu corretamente?"

Contas a pagar, contas a receber, cobrança de atrasados, documentos de
cobrança, importação de extrato e conciliação bancária.

### Camada 2 — Tesouraria
**Pergunta:** "Tem dinheiro suficiente, no lugar certo e na hora certa?"

Posição de caixa, fluxo de caixa realizado e previsto, projeção de caixa,
capital de giro, contas bancárias, dívidas e detecção de falta de caixa.

### Camada 3 — Controle Gerencial
**Pergunta:** "Os números estão corretos e o negócio está performando?"

DRE gerencial, custos, margens, orçamento, orçado × realizado e indicadores.

Sobre essas camadas existe uma quarta superfície, transversal:

### Análises (Assistente Financeiro)
**Pergunta:** "O que esses números significam e o que posso fazer?"

Interpretação, cenários e apoio à decisão — sempre a partir de cálculos
determinísticos do sistema, nunca como fonte da verdade.

## 5. A cadeia de valor do produto

O produto é bem-sucedido quando leva o usuário por esta cadeia sem que ele
perceba que está "subindo de nível":

```
DADO  →  REGISTRO  →  ORGANIZAÇÃO  →  CONCILIAÇÃO  →  CONTROLE
      →  INDICADOR  →  ANÁLISE  →  CENÁRIO  →  DECISÃO HUMANA
```

| Etapa | O que significa para o usuário | Onde acontece |
|---|---|---|
| Dado | "Tenho um boleto na mão / um extrato no banco" | Entrada manual, importação |
| Registro | "Lancei no sistema em poucos segundos" | Contas a pagar / receber |
| Organização | "Está classificado em categoria e centro de custo" | Cadastros, categorias |
| Conciliação | "O que está no banco bate com o que registrei" | Conciliação bancária |
| Controle | "Sei o que está pago, atrasado e o que vence hoje" | Hoje, alertas |
| Indicador | "Sei minha margem, meu caixa, meu resultado" | Dashboard, DRE gerencial |
| Análise | "Entendo por que a margem caiu" | Análises |
| Cenário | "Se eu aumentar o preço em 5%, o que acontece?" | Análises (cenários) |
| Decisão humana | "Eu decido, com base no que entendi" | Fora do sistema |

O sistema **nunca** toma a decisão final. Ele torna a decisão compreensível.

## 6. Princípios de produto

Estes princípios são requisitos, não aspirações. Uma funcionalidade que viola
um deles é bloqueada em revisão.

1. **Simplicidade é requisito funcional.** Cada tela tem um propósito
   dominante. Informação avançada aparece sob demanda (progressive disclosure).
2. **Linguagem do dono, não do contador.** "Marcar como pago", não "efetuar
   baixa de título". Quando um termo técnico for necessário, o sistema ensina.
3. **O sistema calcula; a IA interpreta.** Nenhum valor financeiro é produzido
   por modelo de linguagem. Toda análise mostra os dados usados, as premissas e
   o cálculo.
4. **Nunca misturar realizado com previsto sem identificação clara.**
5. **Perdoar o erro humano.** Desfazer, lixeira, histórico, confirmação forte
   apenas para ações destrutivas ou financeiramente relevantes.
6. **Reduzir digitação.** Recorrência, parcelamento, importação, sugestões de
   conciliação, duplicidade detectada — nunca pedir ao usuário o que o sistema
   já sabe.
7. **Rastreabilidade.** Toda alteração financeira tem autor, data, valor
   anterior e valor novo.
8. **Isolamento por empresa.** Todo registro pertence a uma organização; o
   isolamento é garantido no servidor, nunca apenas na interface.
9. **Precisão monetária.** Dinheiro nunca é ponto flutuante.
10. **Explicabilidade.** Todo indicador responde "O que é isso?", "Como é
    calculado?" e "Por que importa?".

## 7. Filtro de admissão de funcionalidades

Uma funcionalidade só entra no MVP se responder **sim** a pelo menos uma
destas perguntas:

- Ajuda o usuário a **registrar melhor**?
- Ajuda o usuário a **cometer menos erros**?
- Ajuda o usuário a **entender o caixa**?
- Ajuda o usuário a **entender o resultado**?
- Ajuda o usuário a **tomar uma decisão**?

Se a resposta for "não" para todas, a funcionalidade sai do MVP.

## 8. Modelo comercial (resumo — detalhado em `docs/licensing.md` no Gate 2)

- **Licença perpétua por versão maior** (ex.: *Financeiro 1.x*). O cliente
  adquire o direito de uso perpétuo daquela versão. O código-fonte e a
  propriedade intelectual permanecem com a empresa fornecedora.
- **Não incluídos** na compra: versões maiores futuras, novas integrações,
  desenvolvimento sob medida, suporte técnico, migração de dados, consultoria,
  treinamento, gestão de infraestrutura, consumo de API de IA, tarifas de
  integração bancária, novos módulos. Cada item pode ser contratado à parte.
- **Hospedagem** em três modalidades: (A) infraestrutura do cliente,
  (B) conta de nuvem do cliente, (C) hospedagem gerida pelo fornecedor como
  serviço contratado separadamente.
- A lógica de licenciamento **não se acopla** ao domínio financeiro. O
  financeiro não sabe "qual licença" está ativa; ele consulta uma capacidade
  ("este recurso está habilitado?") por meio de uma abstração.

Consequência arquitetural direta: o produto precisa ser **instalável** (Docker,
PostgreSQL do cliente) e não pode depender de serviço gerido pelo fornecedor
para funcionar no dia a dia.

## 9. O que o produto NÃO é

Ver `06-nao-objetivos.md` para a lista completa. Em resumo:

- Não é um ERP completo.
- Não é um sistema fiscal (NF-e/NFS-e) — apenas prepara a fronteira de
  integração.
- Não é um CRM.
- Não é contabilidade oficial — a DRE é **gerencial**.
- Não é um "robô que decide" — a IA apoia, o humano decide.

## 10. Métricas de sucesso do MVP

| Métrica | Meta inicial | Por que importa |
|---|---|---|
| Tempo para registrar uma conta a pagar | ≤ 20 segundos (usuário treinado) | Redução de fricção é o diferencial |
| Tempo para responder "quanto tenho hoje?" | ≤ 10 segundos após login | Promessa do dashboard |
| Lançamentos conciliados sem intervenção manual, com confiança alta | ≥ 60% dos lançamentos de extrato | Prova que a conciliação assistida funciona |
| Duplicidades que chegaram a ser gravadas | 0 sem aviso prévio | Segurança financeira |
| Usuários que precisaram de suporte para o primeiro fechamento mensal | < 30% | Simplicidade do controle gerencial |
| Análises de IA em que o usuário abriu "dados usados / premissas" | medido, sem meta | Verifica se a explicabilidade é usada |
