# UX, Arquitetura de Informacao e Sistema de Interface (Gate 4)

> Documento 1 — indice e ordem de leitura.

Este gate define **como o produto se apresenta**: o que o usuario ve, onde
cada coisa fica, como pedimos dados e como o sistema fala. O codigo
correspondente esta em [`src/interface/`](../../src/interface/LEIA-ME.md).

| # | Documento | Responde |
|---|---|---|
| 1 | este arquivo | Por onde comecar |
| 2 | [principios-ux.md](principios-ux.md) | Como decidimos questoes de interface (15 principios + anti-principios) |
| 3 | [personas-e-tarefas.md](personas-e-tarefas.md) | Quem usa, para fazer o que, com que frequencia |
| 4 | [arquitetura-informacao.md](arquitetura-informacao.md) | Como o produto e organizado na cabeca do usuario; criterios para um item de menu existir |
| 5 | [navegacao.md](navegacao.md) | A casca: barra lateral, cabecalho, abas, rotas, teclado, volta |
| 6 | [mapa-telas.md](mapa-telas.md) | Toda tela do MVP: objetivo, acoes, estados, dados |
| 7 | [dashboard.md](dashboard.md) | `Início`: as perguntas, a hierarquia, os graficos |
| 8 | [tabelas-e-listagens.md](tabelas-e-listagens.md) | O padrao unico de lista |
| 9 | [formularios.md](formularios.md) | Como pedimos dados sem cansar e sem induzir ao erro |
| 10 | [estados-interface.md](estados-interface.md) | Vazio, carregando, erro, sucesso, confirmacao |
| 11 | [conciliacao-bancaria.md](conciliacao-bancaria.md) | A tela mais dificil do produto |
| 12 | [design-tokens.md](design-tokens.md) | A unica fonte de valores visuais |
| 13 | [responsividade.md](responsividade.md) | Desktop primeiro; o que muda em tablet e celular |
| 14 | [acessibilidade.md](acessibilidade.md) | Minimos obrigatorios e checklist de revisao |

## Ordem de leitura sugerida

- **Quem vai desenhar ou revisar uma tela**: 2 → 4 → 5 → 6 → 8/9/10 → 14.
- **Quem vai implementar um componente**: 12 → 14 → o documento do padrao
  (8, 9 ou 10) → `src/interface/LEIA-ME.md`.
- **Quem quer entender o produto**: 3 → 7 → 11.

## Decisoes deste gate

[ADR-020](../decisoes/ADR-020-sistema-de-interface-proprio.md) sistema de
interface proprio ·
[ADR-021](../decisoes/ADR-021-navegacao-lateral.md) navegacao lateral ·
[ADR-022](../decisoes/ADR-022-pagina-gaveta-dialogo.md) pagina/gaveta/dialogo ·
[ADR-023](../decisoes/ADR-023-conciliacao-duas-colunas.md) conciliacao em
duas colunas ·
[ADR-024](../decisoes/ADR-024-camada-apresentacao.md) camada de apresentacao.

## Convencao de escrita

A prosa segue o padrao tecnico dos Gates 2 e 3 (portugues sem acento). Todo
texto entre aspas ou em `codigo` que representa copia de interface aparece
exatamente como o usuario le, com acentuacao correta.

## O que este gate entrega em codigo

- `src/interface/tokens/` — tokens e pontos de quebra;
- `src/interface/componentes/` — 17 componentes do sistema de design;
- `src/interface/formatacao/` — dinheiro, data, percentual;
- `src/interface/casca/` — cabecalho, barra lateral, barra inferior, casca;
- `src/app/(aplicacao)/` — a casca ligada ao Next.js, com `Início` provisorio.

As telas de negocio (listas, formularios, conciliacao) sao construidas nos
Gates 6 a 8 sobre estes padroes. Autenticacao, primeiro acesso e escolha da
empresa ativa sao o Gate 5.
