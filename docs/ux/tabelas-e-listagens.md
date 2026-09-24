# Tabelas e listagens

> Gate 4 · Documento 8 — o padrao unico de lista do produto.

Listagens sao onde Rafael e Carlos passam a maior parte do dia. Um padrao
consistente aqui vale mais do que qualquer tela bonita.

---

## 1. Anatomia padrao

```text
+---------------------------------------------------------------------------+
| CABECALHO DA PAGINA                                                        |
| Contas a pagar · Padaria São Jorge        [Exportar] [Nova conta (n)]      |
+---------------------------------------------------------------------------+
| ABAS:  Todas | Vencidas (6) | A vencer | Aguardando aprovação | Recorrências|
+---------------------------------------------------------------------------+
| RESUMO:  Vencido R$ 8.940 (6) | Vence hoje R$ 1.200 (2) | 7 dias R$ 12.480 |
|          | Total em aberto R$ 63.210 (41)                                  |
+---------------------------------------------------------------------------+
| BARRA DE FILTROS                                                           |
| [buscar /]  [Período: set/2026 v] [Fornecedor v] [Categoria v] [Mais +]    |
| Ativos:  (Vencidas x) (Fornecedor: Moinho Real x)        [Limpar filtros]  |
+---------------------------------------------------------------------------+
| [ ] | Vencimento | Fornecedor      | Descrição  | Categoria | Valor | Situação | ... |
| [ ] | 18/09      | Moinho Real     | Farinha    | Insumos   | 2.400,00 | ! Vencido há 3 dias | [Pagar] |
+---------------------------------------------------------------------------+
| 41 contas · R$ 63.210,00        < Anterior  1 2 3  Próxima >   [50 por pág] |
+---------------------------------------------------------------------------+
```

Sete regioes, sempre na mesma ordem: cabecalho, abas, resumo, filtros, filtros
ativos, corpo, rodape com total e paginacao.

## 2. Resumo acima da tabela

Toda lista financeira comeca por **numeros agregados**, nao pela primeira
linha. Motivo: a pergunta que traz o usuario ali quase nunca e "qual e a
primeira linha", e sim "quanto e isso tudo".

Regras:

- No maximo **quatro** numeros.
- Cada numero e um **filtro clicavel** (clicar em `Vencido` filtra por vencido
  e marca a ficha correspondente).
- Os numeros respeitam os filtros ativos, exceto o filtro que eles proprios
  aplicam — e isso e dito no *tooltip*.
- O rodape repete o total **da pagina atual** e o total **do filtro**, com
  rotulos distintos: `Nesta página` e `Total filtrado`. Confundir os dois e um
  erro classico de sistema financeiro.

## 3. Busca

- Um unico campo, com `/` como atalho, `Esc` para limpar.
- *Debounce* de 300 ms; a busca **nao** recarrega a pagina inteira, so o corpo.
- Busca tolerante a formatacao: `12.345.678/0001-95`, `12345678000195` e
  `Moinho` encontram o mesmo fornecedor.
- Busca por codigo (`CP-2026-000123`) leva direto ao registro.
- O texto buscado fica destacado no resultado.
- Nenhum resultado → estado vazio de filtro (secao 9), nunca tabela em branco.

## 4. Filtros

| Regra | Detalhe |
|---|---|
| Sempre visiveis | Periodo, mais dois filtros de maior uso da tela |
| `Mais filtros` | Abre gaveta com os demais; nunca esconde os tres principais |
| Fichas de filtro ativo | Cada filtro aplicado vira uma ficha removivel com `x` |
| `Limpar filtros` | Aparece so quando ha algo a limpar |
| URL | Todo filtro esta na *query string*: recarregar, compartilhar e voltar funcionam |
| Valor invalido na URL | Conta como filtro ausente (`_apoio/filtros-da-url.ts`); nunca derruba a lista nem a esvazia em silencio |
| Persistencia | O ultimo conjunto de filtros por tela e lembrado na sessao; `Limpar` volta ao padrao |
| Padrao de periodo | Contas a pagar/receber: `Próximos 30 dias`. Movimentacoes: `Mês atual`. DRE: `Mês fechado anterior` |

O filtro de periodo tem atalhos nomeados (`Hoje`, `Esta semana`, `Este mês`,
`Mês passado`, `Personalizado`), porque digitar duas datas e a operacao mais
repetida e mais irritante de um sistema financeiro.

## 5. Colunas

- Ordem fixa: **quando → quem → o que → quanto → situacao → acoes**.
- Data primeiro porque a leitura financeira e cronologica.
- Valor alinhado a direita, tabular, com a mesma quantidade de casas.
- Situacao como selo com icone + texto.
- Maximo de 8 colunas visiveis por padrao; o restante em `Colunas` (Fase 2:
  escolha persistida por usuario).
- Nenhuma coluna so com icone sem rotulo acessivel.

## 6. Ordenacao

- Clique no cabecalho ordena; segundo clique inverte; terceiro volta ao padrao.
- A coluna ordenada mostra seta **e** `aria-sort`.
- Padrao por tela: contas a pagar/receber por `Vencimento` crescente;
  movimentacoes por `Data` decrescente; cadastros por `Nome`.
- Ordenacao vai para a URL.

## 7. Selecao e acoes em lote

- Caixa de selecao na primeira coluna; cabecalho seleciona **a pagina**.
- Ao selecionar tudo em uma pagina, aparece a faixa:
  "50 contas desta página selecionadas. **Selecionar todas as 41 do filtro**".
  Nunca assumimos que o usuario quer o filtro inteiro.
- A barra de acoes em lote aparece fixa no rodape, com o **total selecionado em
  R$** sempre visivel.
- Acao em lote de impacto financeiro (pagar, conciliar, cancelar) exige dialogo
  com resumo: quantos registros, valor total, contas envolvidas.
- Resultado parcial e mostrado item a item: "38 pagamentos registrados.
  3 falharam:" com o motivo de cada um. Nunca "algo deu errado".

## 8. Paginacao

Paginacao numerada, 50 itens por padrao (25/50/100). **Nao usamos rolagem
infinita** em lista financeira: impede saber quantos itens existem, atrapalha
a conferencia, quebra o `Ctrl+F` e torna o total do rodape mentiroso.

## 9. Estados da lista

| Estado | O que aparece |
|---|---|
| Carregando (1a vez) | Esqueleto com 8 linhas do tamanho final; resumo com esqueleto |
| Carregando (troca de filtro) | Corpo esmaecido com indicador discreto; **a altura nao muda** |
| Vazio de verdade | Ilustracao simples + o que e aquela lista + acao primaria + link de ajuda |
| Vazio por filtro | "Nenhuma conta com esses filtros." + `Limpar filtros` + resumo dos filtros aplicados |
| Erro | "Não foi possível carregar a lista." + motivo + `Tentar novamente`; filtros preservados |
| Sem permissao | A tela nem aparece na navegacao; acesso direto responde explicacao |

## 10. Acoes por linha

- No maximo **uma** acao primaria visivel por linha (`Pagar`, `Receber`,
  `Conciliar`), alinhada a direita.
- As demais ficam em menu `⋯` com rotulos por extenso.
- Acao destrutiva/irreversivel nunca fica so como icone e nunca fica em
  primeiro plano na linha.
- Clicar na linha (fora dos controles) abre o detalhe.
- `Enter` abre a linha focada; `Espaco` seleciona.

## 11. Quando nao usar tabela

| Tela | Formato | Motivo |
|---|---|---|
| Contas bancarias | Cartoes | Poucos itens, heterogeneos, objetivo e reconhecimento |
| Pontos de atencao | Lista de linhas com icone | Cada item tem gravidade e acao diferentes |
| Cobranca | Agrupamento por cliente (lista com sublinhas) | A unidade de decisao e o cliente, nao o titulo |
| Conciliacao | Duas colunas pareadas | O objetivo e comparar dois lados |
| DRE | Tabela hierarquica com recuo | Estrutura de arvore, com totais por nivel |
| Extratos importados | Tabela simples | Poucos campos, ordem cronologica |

## 12. Exportacao

Toda lista exporta **o que esta na tela**: mesmos filtros, mesma ordenacao,
mesmas colunas. O arquivo leva no nome a empresa, a tela e o periodo
(`contas-pagar_padaria-sao-jorge_2026-09.csv`). Antes de baixar, o dialogo diz
quantas linhas serao exportadas. Exportar exige `exportacao.executar` e gera
evento de auditoria.
