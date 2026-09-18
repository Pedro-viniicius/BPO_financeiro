# ADR-021 — Navegacao lateral por tarefas, em grupos rotulados

**Status:** Aceita · 2026-09-18

## Contexto

O Gate 2 tem 21 modulos de negocio. O usuario nao pensa em modulos: pensa
"tenho contas para pagar", "quanto tenho no banco", "como foi o mes". A
navegacao e a arquitetura de informacao em codigo
([`docs/ux/arquitetura-informacao.md`](../ux/arquitetura-informacao.md)) e
precisa de uma regra estavel para nao crescer um item por tabela.

## Decisao

Barra lateral fixa com **tres grupos rotulados** (`Operação`, `Tesouraria`,
`Gestão`) mais `Início`, totalizando **9 destinos**, e dois itens de apoio no
rodape (`Cadastros`, `Configurações`). Cada item corresponde a uma tarefa
humana com URL propria; recortes da mesma entidade sao abas, nunca itens.

O mapa vive em `src/interface/casca/mapa-navegacao.ts` e e filtrado pelas
permissoes efetivas do usuario (negar por padrao, ADR-007). Um item so entra se
passar pelos quatro criterios da secao 8 do documento de arquitetura de
informacao. No maximo dois itens exibem contador.

## Alternativas consideradas

| Alternativa | Por que foi rejeitada |
|---|---|
| Um item por modulo (21) | Expoe a arquitetura; `importacao`, `notificacoes` nao sao destinos; menu exige leitura, nao reconhecimento |
| Tres itens com submenu | Esconde as tarefas diarias atras de um clique; Rafael paga 50 vezes por dia |
| Lista plana de 11 itens | Sem ancoras visuais, a busca vira leitura sequencial |
| Menu por pergunta ("Quanto tenho?") | Insuportavel na quarta semana: o usuario experiente quer o nome do lugar |
| Menu superior horizontal | Nao cabe 9 destinos com rotulos legiveis; some no tablet |

## Consequencias

- Acrescentar um destino e uma decisao de produto, nao um efeito colateral de
  criar um modulo. O `mapa-navegacao.teste.ts` trava o limite de contadores.
- Em tablet a barra fica compacta; em celular vira painel + barra inferior de
  quatro destinos ([`docs/ux/responsividade.md`](../ux/responsividade.md)).
- Gate 5: `Início` vive em `/inicio`; `/` apenas redireciona pelo estado de
  acesso (ADR-025).
