# Personas e tarefas

> Gate 4 · Documento 3 — traduz as personas do Gate 1 em **tarefas**, e as
> tarefas em exigencias de interface.

As personas completas estao em [`docs/produto/02-personas.md`](../produto/02-personas.md)
e as jornadas em [`docs/produto/03-jornadas.md`](../produto/03-jornadas.md).
Aqui interessa apenas o que muda o desenho das telas.

---

## 1. Quem usa, com que frequencia, em que dispositivo

| Persona | Papel no sistema | Frequencia | Dispositivo | Tempo por sessao |
|---|---|---|---|---|
| Marcia — dona | Administrador | Diaria, curta | Desktop + celular | 2 a 5 min |
| Rafael — operador | Financeiro | Diaria, intensa | Desktop | 1 a 3 h |
| Juliana — socia-gestora | Gestor | Semanal/mensal | Desktop | 20 a 60 min |
| Carlos — BPO/contador | Financeiro (varias empresas) | Diaria | Desktop | 4 a 8 h |
| Beto — socio aprovador | Gestor (aprova) | Ocasional | Celular | 30 s |

Consequencias imediatas:

- A **primeira tela** e desenhada para Marcia (2 a 5 min, pergunta "e ai?").
- O **atalho de teclado e a densidade** existem por causa de Rafael e Carlos.
- A **troca de empresa** e um elemento de primeira classe por causa de Carlos.
- A **aprovacao** precisa funcionar bem no celular por causa de Beto.
- Os **relatorios comparativos** existem por causa de Juliana.

---

## 2. Tarefas por persona (ordenadas por frequencia)

### Marcia — proprietaria/gestora

| # | Tarefa | Pergunta por tras | Onde acontece |
|---|---|---|---|
| M1 | Ver a situacao de hoje | "Quanto eu tenho?" | Inicio |
| M2 | Ver o que exige atencao | "Tem algo errado?" | Inicio → Pontos de atencao |
| M3 | Ver o que vence esta semana | "O que eu preciso pagar?" | Inicio → Proximos compromissos |
| M4 | Ver quem esta devendo | "Quem me deve?" | Contas a receber (filtro Vencido) |
| M5 | Ver se a empresa deu lucro | "Sobrou dinheiro ou deu lucro?" | Resultados |
| M6 | Perguntar em linguagem natural | "Por que sobrou menos?" | Analises (Gate 9) |

Exigencias: vocabulario sem jargao, explicacao de uma linha em cada indicador,
nenhum grafico sem legenda em palavras, tudo acima da dobra em 1366x768.

### Rafael — financeiro operacional

| # | Tarefa | Frequencia | Onde acontece |
|---|---|---|---|
| R1 | Lancar conta a pagar | Dezenas/dia | Contas a pagar → Nova |
| R2 | Registrar pagamento | Dezenas/dia | Contas a pagar → linha → Registrar pagamento |
| R3 | Lancar/baixar conta a receber | Dezenas/dia | Contas a receber |
| R4 | Importar extrato | 1 a 3/dia | Bancos → Conta → Importar extrato |
| R5 | Conciliar | Diaria | Conciliacao |
| R6 | Anexar documento | Frequente | Detalhe do registro → Documentos |
| R7 | Conferir pendencias do dia | Inicio e fim do dia | Inicio |
| R8 | Registrar contato de cobranca | Semanal | Contas a receber → Cobranca |
| R9 | Corrigir um erro | Semanal | Detalhe → Estornar/Cancelar |

Exigencias: fluxo sem mouse do inicio ao fim do lancamento, "Salvar e criar
outra", aviso de duplicidade, desfazer visivel, nenhuma confirmacao
desnecessaria em acao reversivel.

### Juliana — responsavel/gestora

| # | Tarefa | Periodicidade |
|---|---|---|
| J1 | Conferir o fechamento do mes | Mensal |
| J2 | Comparar orcado x realizado | Mensal |
| J3 | Analisar resultado por categoria e centro de custo | Mensal |
| J4 | Detectar inconsistencia (nao classificado, nao conciliado) | Mensal |
| J5 | Acompanhar caixa projetado | Semanal |
| J6 | Exportar para o contador | Mensal |

Exigencias: comparacao entre periodos, *drill-down* ate o lancamento,
"Nao classificado" sempre visivel, exportacao.

### Carlos — BPO / contador externo

| # | Tarefa | Particularidade |
|---|---|---|
| C1 | Trocar de empresa | Dezenas de vezes por dia |
| C2 | Ver pendencias de todas as empresas que atende | Visao transversal |
| C3 | Executar R1–R6 em cada empresa | Mesmo fluxo do Rafael |
| C4 | Fechar o mes de varias empresas | Repetitivo |

Exigencias: seletor de empresa sempre visivel e com busca por teclado;
identidade visual clara da empresa ativa (evitar lancar na empresa errada —
risco alto); atalho para "proxima empresa com pendencia".

### Beto — aprovador ocasional

| # | Tarefa |
|---|---|
| B1 | Ver o que espera aprovacao |
| B2 | Entender o que e (fornecedor, valor, vencimento, anexo) |
| B3 | Aprovar ou recusar com motivo |

Exigencias: funciona no celular, sem treinamento, com anexo visivel e
segregacao de funcoes explicada em uma frase quando ele nao puder aprovar.

---

## 3. Matriz tarefa x tela

| Tarefa | Tela principal | Permissao exigida |
|---|---|---|
| M1, M2, M3, R7 | Inicio | `contas_pagar.visualizar` + `bancos.visualizar` (parcial sem elas) |
| R1 | Contas a pagar → formulario | `contas_pagar.criar` |
| R2 | Contas a pagar → registrar pagamento | `contas_pagar.pagar` |
| B1–B3 | Aprovacoes (aba de Contas a pagar) | `contas_pagar.aprovar` |
| R3 | Contas a receber | `contas_receber.criar` / `.baixar` |
| M4, R8 | Contas a receber → Cobranca | `cobranca.visualizar` / `.registrar_contato` |
| R4 | Bancos → Importar extrato | `bancos.importar_extrato` |
| R5 | Conciliacao | `bancos.conciliar` |
| J5 | Fluxo de caixa | `fluxo_caixa.visualizar` |
| M5, J1, J3 | Resultados (DRE) | `dre.visualizar` |
| J2 | Orcamento | `orcamento.visualizar` |
| J6 | Exportar (acao dentro de cada tela) | `exportacao.executar` |
| C1 | Seletor de empresa (cabecalho) | `empresas.visualizar` |

Regra: **a interface nunca mostra uma acao que o usuario nao pode executar**.
Quando a ausencia puder confundir ("por que nao consigo aprovar?"), mostramos o
elemento desabilitado com a razao em texto — nunca um erro depois do clique.

---

## 4. Momentos de risco (onde o erro custa caro)

| Momento | Risco | Defesa na interface |
|---|---|---|
| Lancar na empresa errada | Alto (Carlos) | Empresa ativa sempre visivel no cabecalho e repetida no titulo do formulario |
| Lancar a mesma conta duas vezes | Alto (Rafael) | Aviso de duplicidade provavel antes de salvar |
| Conciliar item errado | Alto | Confirmacao com resumo dos dois lados; sugestao so aplica automatico com confianca alta |
| Estornar pagamento certo | Medio | Resumo do impacto antes de confirmar |
| Pagar valor errado | Alto | Campo de dinheiro com mascara, resumo antes de confirmar, comparacao com o valor da parcela |
| Aprovar sem ler | Medio | Anexo e valor no mesmo bloco do botao |
