# ADR-020 — Sistema de interface proprio: CSS Modules + tokens, sem biblioteca de componentes

**Status:** Aceita · 2026-09-18

## Contexto

O Gate 4 precisa de um conjunto pequeno de componentes (botao, tabela densa,
gaveta, dialogo, campo de dinheiro, selo de situacao) com regras muito
especificas: numeros tabulares, cor nunca sozinha, `<dialog>` nativo, densidade
de planilha. O produto roda tambem em servidor local do cliente (Modelo C),
sem internet garantida, e tem licenca perpetua por versao — cada dependencia
de interface e um custo de manutencao por anos.

## Decisao

- **CSS Modules** com **design tokens** em custom properties
  (`src/interface/tokens/tokens.css`). Nenhum valor visual literal fora do
  arquivo de tokens ([`docs/ux/design-tokens.md`](../ux/design-tokens.md)).
- **Componentes proprios** em `src/interface/componentes/`, exportados por um
  unico `indice.ts`. Sem Tailwind, sem shadcn/Radix, sem Material.
- **Elementos nativos primeiro**: `<dialog>`, `<details>`, `<input type=search>`,
  `<fieldset>`. So se escreve JavaScript de acessibilidade quando o nativo nao
  cobre.
- **Fonte do sistema** (`system-ui`): zero download, zero licenca.

## Alternativas consideradas

| Alternativa | Por que foi rejeitada |
|---|---|
| **Tailwind** | Valores literais espalhados nos componentes contrariam a regra de tokens; classes longas em uma equipe pequena viram ruido; migrar depois e caro |
| **shadcn/ui + Radix** | Boa acessibilidade, mas traz Tailwind, dezenas de dependencias transitivas e um estilo visual que precisariamos combater (tabela densa, numeros tabulares). Reavaliar se o numero de componentes passar de ~40 |
| **Material UI / Ant Design** | Estetica e densidade erradas para planilha financeira; peso de bundle; API grande demais para o que usamos |
| **CSS-in-JS (styled-components, emotion)** | Custo em Server Components e no build; CSS Modules resolve o mesmo problema sem runtime |

## Consequencias

- Positivas: bundle minimo; tema e densidade controlados em um arquivo;
  nenhuma dependencia de interface a auditar em `verificar:licencas`; a
  acessibilidade e a nossa, e conhecida.
- Negativas: escrevemos e testamos os componentes nos mesmos. Aceito porque o
  conjunto e pequeno (17 componentes no Gate 4) e muito especifico.
- Gatilho de revisao: se o produto precisar de componentes complexos (editor
  rico, calendario com arraste, grafico interativo), avaliar biblioteca
  pontual para aquele componente — nao um *framework* inteiro.
