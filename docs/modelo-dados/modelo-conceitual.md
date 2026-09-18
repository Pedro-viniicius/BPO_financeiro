# Modelo Conceitual

> Gate 3 · Documento 1. Escrito ANTES dos esquemas. Descreve o negocio real;
> o modelo relacional (`dicionario-dados.md`) deriva daqui.

Sequencia adotada: negocio real → conceitos → relacionamentos → invariantes
→ modelo relacional → PostgreSQL → Drizzle.

## 1. O negocio em uma pagina

Uma **empresa** (CNPJ) compra de **fornecedores** e vende para **clientes**.
Cada compra gera uma obrigacao — um **titulo a pagar** — e cada venda um
direito — um **titulo a receber**. Titulos sao divididos em **parcelas**, cada
uma com vencimento e valor. Quando a empresa paga uma parcela, nasce um
**pagamento**; quando recebe, um **recebimento**. Cada pagamento ou recebimento
move dinheiro de/para uma **conta bancaria** (ou o caixa), gerando uma
**movimentacao bancaria** — o que o sistema entende que aconteceu.

O banco, por sua vez, informa o que ELE viu: o **extrato bancario**, composto de
**itens**. **Conciliar** e confirmar que um item do extrato corresponde a uma ou
mais movimentacoes internas (ou vice-versa).

Para entender o resultado, cada titulo e classificado em uma **categoria
financeira** ("Energia eletrica"), que aponta para uma **conta do plano
gerencial** ("3.2.01 Despesas com energia"), que define a linha da **DRE
gerencial**. Opcionalmente, um **centro de custo** ("Loja Centro") diz qual
area gastou ou gerou. O **orcamento** planeja valores por mes, categoria e
centro de custo. **Dividas** (emprestimos) tem parcelas com juros e amortizacao.
Documentos (boletos, notas, comprovantes) sao **anexos**.

## 2. Conceitos (entidades e objetos de valor)

### 2.1 Entidades

| Conceito | O que e no mundo real | Identidade |
|---|---|---|
| Organizacao | grupo empresarial ou cliente do BPO | id |
| Empresa | pessoa juridica (CNPJ) dona dos dados financeiros | id; CNPJ unico na instalacao |
| Filial | unidade operacional de uma empresa | id |
| Pessoa | alguem com quem a empresa se relaciona: pessoa fisica ou juridica | id; CPF/CNPJ unico na organizacao |
| Cliente | **papel** de uma pessoa perante uma empresa (deve dinheiro a ela) | id; (empresa, pessoa) unico |
| Fornecedor | **papel** de uma pessoa perante uma empresa (a empresa deve a ela) | id; (empresa, pessoa) unico |
| Instituicao bancaria | o banco em si (Banco do Brasil, Nubank) | codigo de compensacao |
| Conta bancaria | onde a empresa guarda dinheiro: conta corrente, poupanca, conta de pagamento, aplicacao ou **caixa** (dinheiro em especie) | id; (empresa, nome) unico |
| Categoria financeira | natureza do gasto/receita em linguagem do dono ("Energia") | id; (empresa, nome) unico |
| Conta do plano | linha do plano de contas gerencial ("3.2.01.004") — define a DRE | id; (empresa, codigo) unico |
| Centro de custo | area/projeto/unidade que gasta ou gera | id; (empresa, codigo) unico |
| Titulo a pagar | obrigacao com um fornecedor (uma nota, um boleto, um contrato) | id; codigo humano CP-AAAA-NNNNNN |
| Parcela a pagar | fatia do titulo com vencimento e valor proprios | id; (titulo, numero) unico |
| Pagamento | ato de pagar (total ou parte de) uma parcela em uma data, por uma conta | id |
| Titulo a receber | direito contra um cliente | id; codigo CR-AAAA-NNNNNN |
| Parcela a receber | fatia do titulo a receber | id; (titulo, numero) unico |
| Recebimento | ato de receber (total ou parte de) uma parcela | id |
| Regra de recorrencia | modelo que gera titulos repetidos (aluguel todo dia 5) | id |
| Movimentacao bancaria | entrada ou saida efetiva em uma conta, segundo o sistema | id |
| Transferencia | par de movimentacoes entre duas contas da mesma empresa | id |
| Extrato bancario | um arquivo importado (OFX/CSV/XLSX) de uma conta | id; impressao digital unica por conta |
| Item de extrato | uma linha do extrato: o que o banco informou | id; identificador externo unico por conta |
| Conciliacao | decisao humana ou assistida ligando itens de extrato a movimentacoes | id |
| Divida | emprestimo/financiamento com credor, principal, juros e prazo | id |
| Parcela de divida | prestacao com juros e amortizacao | id; (divida, numero) unico |
| Pagamento de divida | pagamento de uma parcela de divida | id |
| Orcamento | plano anual de uma empresa | id; (empresa, ano, nome) unico |
| Item de orcamento | valor planejado para (mes, categoria, centro de custo) | id; combinacao unica |
| Arquivo | metadados de um arquivo guardado fora do banco | id; chave de armazenamento unica |
| Anexo | vinculo de um arquivo a um titulo, pagamento, recebimento, divida ou pessoa | id |
| Sequencia de codigo | contador por (empresa, prefixo, ano) para codigos humanos | (empresa, prefixo, ano) |

### 2.2 Objetos de valor (sem identidade propria)

| Objeto de valor | Composicao | Onde aparece |
|---|---|---|
| Dinheiro | valor em centavos + moeda (BRL) | todo campo `valor_*` |
| Percentual | 4 casas decimais | `taxa_juros_mensal` |
| Data civil | dia sem hora/fuso | `data_*` |
| Documento (CPF/CNPJ) | somente digitos, validado por digito verificador | `pessoas.cpf_cnpj`, `empresas.cnpj` |
| Situacao | valor de um conjunto finito (enum) | `situacao` |
| Composicao de baixa | principal + juros + multa − desconto = valor movimentado | pagamentos, recebimentos |

## 3. Agregados e donos

Um agregado e o conjunto de entidades que muda junto, sob uma unica raiz.
Escrever em uma entidade filha exige passar pela raiz.

| Agregado (raiz) | Contem | Regra de escrita |
|---|---|---|
| **Titulo a pagar** | parcelas a pagar | criar/alterar parcelas so pelo titulo; pagamentos referenciam a parcela mas sao registrados por operacao propria (`registrarPagamento`) que trava a parcela |
| **Titulo a receber** | parcelas a receber | idem |
| **Pagamento** / **Recebimento** | — (referencia parcela e movimentacao) | imutavel apos registrado; so `estornar` |
| **Conta bancaria** | saldo inicial | movimentacoes referenciam a conta mas pertencem ao proprio agregado |
| **Movimentacao bancaria** | — | imutavel; estorno cria movimentacao inversa |
| **Extrato bancario** | itens de extrato | itens nascem com o extrato; extrato pode ser revertido (itens apagados) apenas se nenhum item estiver conciliado |
| **Conciliacao** | vinculos com itens e com movimentacoes | criada de uma vez; `desfazer` desativa os vinculos |
| **Divida** | parcelas de divida | pagamentos de divida por operacao propria |
| **Orcamento** | itens de orcamento | itens vivem e morrem com o orcamento |
| **Pessoa** | papeis cliente/fornecedor | papeis podem ser desativados, nunca apagados se referenciados |
| **Arquivo** | anexos (vinculos) | remover vinculo nao remove o arquivo; arquivo sem vinculos pode ser removido por rotina |

## 4. Relacionamentos e cardinalidades

```
organizacao        1 ── N  empresa
empresa            1 ── N  filial
organizacao        1 ── N  pessoa
pessoa             1 ── N  cliente        (uma pessoa pode ser cliente de varias empresas do grupo)
pessoa             1 ── N  fornecedor
empresa            1 ── N  cliente / fornecedor / conta_bancaria / categoria / conta_plano / centro_custo
instituicao_banc.  1 ── N  conta_bancaria (0 quando e caixa)
conta_plano        1 ── N  categoria_financeira
categoria          1 ── N  categoria (hierarquia: pai → filhas)
fornecedor         1 ── N  titulo_pagar
titulo_pagar       1 ── N  parcela_pagar   (≥ 1 quando nao e rascunho)
parcela_pagar      1 ── N  pagamento       (pagamento parcial existe)
pagamento          1 ── 1  movimentacao_bancaria (a saida) ; 0..1 movimentacao de estorno
cliente            1 ── N  titulo_receber
titulo_receber     1 ── N  parcela_receber
parcela_receber    1 ── N  recebimento
recebimento        1 ── 1  movimentacao_bancaria
regra_recorrencia  1 ── N  titulo (pagar ou receber)
conta_bancaria     1 ── N  movimentacao_bancaria / extrato_bancario / item_extrato
transferencia      1 ── 2  movimentacao_bancaria (saida na origem, entrada no destino)
extrato_bancario   1 ── N  item_extrato
conciliacao        N ── N  item_extrato        (via conciliacoes_itens_extrato)
conciliacao        N ── N  movimentacao        (via conciliacoes_movimentacoes)
   → um item ou uma movimentacao participa de NO MAXIMO UMA conciliacao ativa
divida             1 ── N  parcela_divida
parcela_divida     1 ── N  pagamento_divida
orcamento          1 ── N  item_orcamento
arquivo            1 ── N  anexo (por tipo de entidade)
titulo/pagamento/… 1 ── N  anexo
```

Por que conciliacao e N:N: um debito unico no banco pode quitar tres
boletos pagos juntos (1 item ↔ 3 movimentacoes); um recebimento interno pode
aparecer como duas entradas parciais no extrato (2 itens ↔ 1 movimentacao).
Forcar 1:1 obrigaria o usuario a inventar registros falsos.

## 5. Invariantes (o que nunca pode ser verdade)

Quem garante: **B** = banco (constraint), **A** = aplicacao (caso de uso), **B+A** = ambos.

| # | Invariante | Quem |
|---|---|---|
| I1 | Todo registro financeiro tem `empresa_id` valido | B |
| I2 | Filial pertence a empresa; cliente/fornecedor pertencem a pessoa e empresa existentes | B (FK) |
| I3 | CPF tem 11 digitos e CNPJ 14; so digitos; unico por organizacao | B (CHECK + UNIQUE) + A (digito verificador) |
| I4 | Parcela pertence a titulo existente; numero > 0; (titulo, numero) unico | B |
| I5 | `valor_original` de parcela > 0; `valor_pago` ≥ 0 | B |
| I6 | Pagamento: `valor_pago = principal + juros + multa − desconto`; todos ≥ 0; `valor_pago` > 0 | B |
| I7 | Pagamento referencia parcela, conta bancaria e exatamente uma movimentacao de saida | B (FK, UNIQUE) |
| I8 | Um pagamento so pode ser estornado uma vez; estorno gera movimentacao inversa | B (situacao) + A |
| I9 | Titulo aprovado: `aprovado_por ≠ criado_por` | B (CHECK) |
| I10 | Titulo nao-rascunho tem ≥ 1 parcela e `valor_total = Σ valor_original` | A (regra transacional) |
| I11 | Movimentacao: `valor > 0`; sentido dado por `tipo` | B |
| I12 | Transferencia: conta origem ≠ destino; ambas da mesma empresa | B (CHECK) + A |
| I13 | Extrato: mesma impressao digital nao importa duas vezes na mesma conta | B (UNIQUE) |
| I14 | Item de extrato: identificador externo unico por conta; impressao digital da linha unica por conta | B (UNIQUE parcial) |
| I15 | Item ou movimentacao em no maximo uma conciliacao ativa | B (UNIQUE parcial) |
| I16 | Conciliacao: Σ itens = Σ movimentacoes (mesma empresa e conta) | A |
| I17 | Conciliacao desfeita nao pode ser "refeita": cria-se nova | B (situacao) |
| I18 | Extrato so pode ser revertido se nenhum item estiver conciliado | B (FK RESTRICT) |
| I19 | Divida: principal > 0, taxa ≥ 0; parcela: amortizacao + juros = valor_total | B |
| I20 | Item de orcamento: valor ≥ 0; (orcamento, mes, categoria, centro) unico; mes = dia 1 | B |
| I21 | Codigo humano (CP-2026-000123) unico por empresa; gerado sem colisao sob concorrencia | B (UNIQUE + lock em sequencia) |
| I22 | Arquivo: tamanho > 0; chave unica; hash presente | B |
| I23 | Registros que viraram historia (pagamento registrado, titulo com pagamento, movimentacao, conciliacao) nao sao apagados; sao cancelados/estornados/desfeitos | B (FK RESTRICT) + A |
| I24 | Auditoria somente insercao | B (privilegio + gatilho) |
| I25 | Saldo de conta = saldo inicial + Σ entradas − Σ saidas; nunca campo editavel | derivado (nao armazenado) |

## 6. Ciclos de vida (resumo; detalhado em `ciclo-vida.md`)

- Titulo a pagar: rascunho → (aguardando_aprovacao →) aberto → cancelado. "Pago"
  e derivado das parcelas.
- Parcela a pagar: aberta → paga | cancelada. "Parcial" e "vencida" sao derivadas.
- Pagamento: registrado → estornado.
- Titulo/parcela a receber: idem, com `perdida` (baixa por perda) na parcela.
- Movimentacao: imutavel; estorno = movimentacao inversa vinculada.
- Extrato: importado → revertido (fisico, so sem conciliacoes).
- Item de extrato: pendente → conciliado | ignorado (derivado/decisao).
- Conciliacao: ativa → desfeita.
- Divida: ativa → quitada | cancelada.
- Orcamento: rascunho → ativo → encerrado.

## 7. Pertencimento (tenancy)

| Nivel | Entidades |
|---|---|
| Instalacao | instituicoes_bancarias, usuarios (Better Auth), tarefas, eventos de saida |
| Organizacao | pessoas, vinculos de usuario |
| Empresa | tudo que e financeiro: clientes, fornecedores, contas bancarias, classificacao, titulos, parcelas, pagamentos, recebimentos, movimentacoes, extratos, conciliacoes, dividas, orcamentos, arquivos, sequencias |
| Filial (opcional) | contas bancarias, centros de custo, titulos (quando a operacao e por unidade) |

Detalhes em `pertencimento-dados.md`.

## 8. Requisitos de historico

| Dado | Regra |
|---|---|
| Pagamentos, recebimentos, movimentacoes | nunca apagados; estorno cria registro inverso |
| Titulos com pagamento | nunca apagados; cancelamento so com estorno previo |
| Titulos em rascunho sem pagamentos | podem ser apagados fisicamente (nao viraram historia) |
| Conciliacoes | nunca apagadas; `desfeita_em` preserva a decisao anterior |
| Extratos sem conciliacao | podem ser revertidos (apagados) — dado tecnico reimportavel |
| Pessoas, categorias, contas | desativadas (`ativo = false`), nunca apagadas se referenciadas (FK RESTRICT) |
| Orcamentos | apagaveis enquanto rascunho; encerrados sao historico |
| Snapshot intencional | `titulos_*.valor_total` e `parcelas_*.valor_pago` (desnormalizacao justificada por consulta); nome do fornecedor NAO e copiado (referencia) |

## 9. O que ficou fora do modelo conceitual (consciente)

Faturas/documentos de cobranca (`faturamento`), premissas de previsao,
periodo fechado, linhas de credito, enderecos, multiplas moedas, rateio de
um titulo entre varios centros de custo. Ver `LEIA-ME.md`, secao "Adiado".
