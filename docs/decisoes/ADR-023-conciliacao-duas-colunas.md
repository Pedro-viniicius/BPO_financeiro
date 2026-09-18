# ADR-023 — Conciliacao bancaria em duas colunas pareadas, so no desktop

**Status:** Aceita · 2026-09-18

## Contexto

A conciliacao e a tela mais dificil do produto: o usuario compara duas listas
que deveriam contar a mesma historia (extrato x lancamentos) e a relacao e N:N
(um pagamento agrupado pelo banco, uma movimentacao parcelada pelo banco). Uma
conciliacao errada corrompe o saldo e so e descoberta no fechamento.

## Decisao

- **Duas colunas de largura igual**, extrato a esquerda e sistema a direita,
  com os mesmos filtros e a mesma ordenacao. Simetria visual reforca que os
  dois lados sao comparaveis.
- **Barra de acao fixa no rodape** com tres numeros: total selecionado a
  esquerda, total selecionado a direita e a **diferenca** — o elemento mais
  importante da tela. Conciliar so e possivel com diferenca zero ou com
  justificativa explicita (tarifa, arredondamento) registrada.
- **Cabecalho com progresso** (quantos faltam de cada lado, percentual
  conciliado): o usuario precisa ver o fim da tarefa.
- Sugestoes automaticas em tres niveis de confianca, sempre explicaveis e
  sempre aceitas por uma pessoa; nunca conciliacao automatica total.
- **Nao existe versao para celular.** A rota informa "A conciliação precisa
  de uma tela maior. Abra no computador." com o numero de pendencias.

Detalhes em [`docs/ux/conciliacao-bancaria.md`](../ux/conciliacao-bancaria.md).

## Alternativas consideradas

| Alternativa | Por que foi rejeitada |
|---|---|
| Lista unica do extrato com "buscar correspondente" por linha | Esconde o lado do sistema; nao mostra o que sobrou sem par; N:N vira fluxo de varios passos |
| Lista de "pares sugeridos" para aceitar/rejeitar | Otima para 80% dos casos e cega para os 20% que causam erro; a pessoa nao ve o todo |
| Versao empilhada para celular | Uma versao pior de uma tarefa critica induz erro; melhor dizer nao |
| Conciliacao automatica acima de um limiar de confianca | Contraria o principio "o sistema sugere, a pessoa decide" (Gate 1) |

## Consequencias

- A tela exige teclado completo (secao 8 do documento de UX) porque o volume
  e alto; isso esta no escopo do Gate 7.
- A ausencia no celular e uma decisao de produto registrada, nao uma
  pendencia.
