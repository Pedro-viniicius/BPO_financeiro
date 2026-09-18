# Acessibilidade

> Gate 4 · Documento 14 — minimos obrigatorios, verificaveis em revisao.

---

## 1. Por que isto e regra e nao "boa pratica"

Rafael (BPO) opera 50 lancamentos por dia com o teclado; Beto aprova no
celular sob sol; Marcia usa o zoom do navegador em 150%. Acessibilidade aqui
nao e um publico a parte: e o mesmo usuario em condicoes diferentes.

Alvo: **WCAG 2.2 nivel AA** nos criterios listados abaixo. O que nao esta
listado nao esta prometido — mas nada aqui e opcional.

## 2. Cor

- Contraste de texto ≥ 4,5:1; de bordas e icones informativos ≥ 3:1. Os
  tokens semanticos ja garantem isso (ver
  [`design-tokens.md`](design-tokens.md), secao 5); usar cor fora dos tokens e
  proibido.
- **Cor nunca e o unico portador de significado** (principio 7). Toda
  situacao tem texto: "Vencida" escrito, nao apenas vermelho. Valor negativo
  tem o sinal `-` e o rotulo, nao apenas a cor.
- Graficos: cada serie tem rotulo em texto e padrao/forma distinguivel; a
  legenda nao depende de cor.

## 3. Teclado

- Tudo o que se faz com mouse se faz com teclado. Nenhum campo depende de
  arrastar; o calendario e opcional e a data e sempre digitavel.
- Foco visivel em **todo** elemento interativo (`:focus-visible` global com
  `--cor-foco`). Remover o *outline* sem substituir e proibido.
- Ordem de tabulacao igual a ordem visual.
- Link "Pular para o conteúdo" e o primeiro elemento focavel da casca.
- Gaveta e dialogo usam `<dialog>` nativo: foco preso, `Esc` fecha, foco
  volta ao elemento que abriu.
- Atalhos globais ([`navegacao.md`](navegacao.md), secao 8) nunca capturam
  uma tecla sozinha enquanto o foco esta em campo de texto.

## 4. Formularios

- Todo campo tem `<label>` real associado por `for`/`id`. *Placeholder* mostra
  formato (`00,00`), jamais o rotulo.
- Obrigatorio marcado em texto ("obrigatório"), nao so com asterisco.
- Agrupamentos em `<fieldset>` + `<legend>`.
- Erro associado ao campo por `aria-describedby` e anunciado com
  `aria-live="polite"`; a mensagem diz o que aconteceu e o que fazer.
- Campo de dinheiro e `inputmode="decimal"`, aceita virgula e ponto.

## 5. Estrutura e semantica

- Um `<h1>` por tela (o `CabecalhoPagina`); secoes com `<h2>`; nada pula
  nivel.
- Regioes nomeadas: `<header>`, `<nav aria-label="Navegação principal">`,
  `<main id="conteudo">`, `<nav aria-label="Navegação rápida">`.
- Tabelas com `<th scope="col">`, `<caption>` ou `aria-label`, e ordenacao
  anunciada por `aria-sort`.
- Item ativo da navegacao com `aria-current="page"`.
- Contadores e selos tem texto para leitor de tela
  (`.apenas-leitor-de-tela`): "6 itens precisam de atenção", nao "6".
- Icones decorativos com `aria-hidden="true"`; icones que carregam
  significado tem rotulo.

## 6. Movimento e tempo

- `prefers-reduced-motion: reduce` zera transicoes e animacoes (token
  global).
- Nenhuma informacao desaparece sozinha: avisos ficam ate serem fechados ou
  ate a proxima acao; nada tem *timeout* de leitura.
- Esqueleto de carregamento tem `aria-busy="true"` na regiao.

## 7. Zoom e tamanho

- Layout funciona com zoom de 200% sem rolagem horizontal (as faixas de
  [`responsividade.md`](responsividade.md) cuidam disso: zoom 200% em 1440px
  cai na faixa "tablet").
- Alvo de toque minimo 44px em tablet e celular; 36px no desktop com
  espacamento entre alvos.
- Texto de campos com 16px no celular (evita zoom automatico do iOS).

## 8. Linguagem

- Portugues do Brasil, acentuado, na voz do usuario. Mensagens respondem
  "o que aconteceu, por que, o que fazer" (principio 9).
- Numeros com separador brasileiro (`1.234,56`), datas `dd/mm/aaaa`,
  com `<time datetime>` para leitores.
- `lang="pt-BR"` no documento.

## 9. Checklist de revisao (por tela)

```text
[ ] Navego a tela inteira so com Tab/Shift+Tab/Enter/Esc/setas
[ ] Vejo onde esta o foco em todos os passos
[ ] Cubro a tela com filtro cinza: ainda sei o que esta vencido/pago
[ ] Todo campo tem rotulo; todo erro diz o que fazer
[ ] Um h1, h2 em ordem, regioes nomeadas
[ ] Zoom 200%: nada corta, nada rola de lado
[ ] Leitor de tela le contadores e selos com sentido
```

Ferramentas: verificacao automatica (axe) roda no lint das telas quando o
Gate 5 introduzir testes de componente; ate la, a checklist e manual e faz
parte da revisao de cada tela nova.
