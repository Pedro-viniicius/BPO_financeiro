# ADR-022 — Onde uma acao abre: pagina, gaveta ou dialogo

**Status:** Aceita · 2026-09-18

## Contexto

Sem regra, cada tela decide sozinha se abre um modal, um painel ou navega — e
o usuario perde o contexto (modal sobre modal), perde a URL (formulario longo
em modal) ou perde a lista (navegacao para ver um detalhe de dois campos).

## Decisao

Tres formatos, escolhidos por **duas perguntas**: o destino tem URL propria e
conteudo longo? A decisao e curta e bloqueante?

| Situacao | Formato |
|---|---|
| Destino com URL propria, conteudo longo (detalhe de titulo, DRE) | **Pagina** |
| Criacao com muitos campos (nova conta a pagar) | **Pagina** |
| Consulta ou edicao rapida sem perder a lista (ver/editar a partir da lista, filtros avancados) | **Gaveta** lateral de 480px (`Gaveta`) |
| Decisao curta e bloqueante (confirmar estorno, confirmar conciliacao) | **Dialogo** (`DialogoConfirmacao`) |
| Criacao de apoio dentro de um fluxo (novo fornecedor a partir do formulario) | **Dialogo** |

Proibicoes: dialogo sobre dialogo; gaveta sobre gaveta; formulario longo em
dialogo; dialogo sem acao primaria nomeada ("Estornar pagamento", nunca "OK").

Gaveta e dialogo usam `<dialog>` nativo: foco preso, `Esc` fecha, foco
devolvido a origem. No celular a gaveta ocupa a tela inteira.

## Alternativas consideradas

- **Tudo em pagina** — simples, mas obriga a perder a lista para ver dois
  campos; Rafael abre 50 detalhes por dia.
- **Tudo em modal** — perde URL, quebra o botao Voltar, e o caminho natural
  para modal sobre modal.
- **Gaveta com URL propria (`?detalhe=CP-...`)** — considerada e **adiada**:
  quando a gaveta de detalhe existir (Gate 6), ela deve refletir na URL para
  suportar recarregar e compartilhar; a regra desta ADR nao muda.

## Consequencias

- O revisor de uma tela nova pergunta apenas as duas perguntas.
- Os componentes `Gaveta` e `DialogoConfirmacao` sao os unicos lugares com
  `showModal()`; nenhum componente cria sobreposicao propria.
