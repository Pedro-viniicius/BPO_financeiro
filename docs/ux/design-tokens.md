# Design tokens

> Gate 4 · Documento 12 — a unica fonte de valores visuais do produto.
> Codigo: [`src/interface/tokens/tokens.css`](../../src/interface/tokens/tokens.css)
> e [`pontos-de-quebra.ts`](../../src/interface/tokens/pontos-de-quebra.ts).
> Decisao: [ADR-020](../decisoes/ADR-020-sistema-de-interface-proprio.md).

---

## 1. Regra

Nenhum componente escreve cor, espaco, raio, sombra, tamanho de fonte ou
z-index literal. Tudo vem de `tokens.css`. O valor literal aparece **uma vez**,
na definicao do token, com o nome que explica o uso.

Consequencias praticas:

- mudar a paleta ou a densidade e uma alteracao em um arquivo;
- um componente que precisa de um valor inexistente **cria um token** com nome
  semantico, nao escreve o numero;
- modo escuro e tema por cliente (nao planejados no MVP) viram uma redefinicao
  de `:root`, nao uma reescrita de componentes.

## 2. Nomenclatura

`--<familia>-<variante>`, em portugues, sem acento, *kebab-case* — a mesma
regra dos identificadores do Gate 2 (ADR-016).

| Familia | Exemplos | O que responde |
|---|---|---|
| `espaco-N` | `--espaco-1` … `--espaco-8` | Quanto afastar |
| `texto-*` | `--texto-xs` … `--texto-3xl` | Que tamanho de letra |
| `peso-*`, `altura-linha-*` | `--peso-forte`, `--altura-linha-base` | Como e o texto |
| `raio-N`, `largura-borda*` | `--raio-2`, `--largura-borda-forte` | Forma da caixa |
| `superficie-*` | `--superficie-fundo`, `--superficie-cartao` | Onde algo esta apoiado |
| `cor-texto-*`, `cor-borda*` | `--cor-texto-secundario` | Tinta neutra |
| `cor-<semantica>-<forte/suave/borda>` | `--cor-perigo-forte` | Significado |
| `cor-valor-*` | `--cor-valor-negativo` | Sinal de um valor financeiro |
| `opacidade-*`, `cor-foco`, `anel-foco` | | Estados |
| `sombra-N` | `--sombra-1` … `--sombra-3` | Elevacao |
| `transicao-*` | `--transicao-base` | Movimento |
| `camada-*` | `--camada-gaveta` | Ordem de empilhamento |
| Layout da casca | `--largura-barra-lateral`, `--altura-cabecalho` | Medidas fixas da casca |

## 3. Espacamento — escala de 4px

`--espaco-1` (4px) a `--espaco-8` (64px). Regras de uso:

| Token | Uso tipico |
|---|---|
| `1`–`2` | Entre icone e rotulo; dentro de um selo |
| `3`–`4` | Padding interno de campos, botoes, celulas |
| `5` | Entre secoes de um formulario; padding de cartao |
| `6` | Margem lateral do conteudo no desktop |
| `7`–`8` | Separacao de blocos do `Início`; area vazia |

## 4. Tipografia

Fonte do sistema (`system-ui`), sem fonte externa: zero download, zero
licenca, aparencia nativa em cada plataforma (Modelo C roda em servidor
local sem internet garantida).

| Token | Tamanho | Uso |
|---|---|---|
| `--texto-xs` | 11px | Rotulo de coluna, legenda, contador |
| `--texto-sm` | 13px | Texto de apoio, descricao |
| `--texto-base` | 14px | Corpo — a interface e densa de proposito |
| `--texto-md` | 16px | Campos de formulario e leitura longa (evita zoom no iOS) |
| `--texto-lg` | 18px | Titulo de secao |
| `--texto-xl` | 22px | Titulo de pagina |
| `--texto-2xl` | 28px | Valor em destaque (cartao de resumo) |
| `--texto-3xl` | 40px | `Disponível hoje` no `Início` |

Numeros financeiros usam sempre a classe `.numero-tabular`
(`font-variant-numeric: tabular-nums`) — principio 8.

## 5. Cores semanticas

Cada familia tem exatamente tres tons:

| Sufixo | Onde | Contraste minimo garantido |
|---|---|---|
| `-forte` | Texto e icone | ≥ 4,5:1 sobre `-suave` e sobre `--superficie-cartao` |
| `-suave` | Fundo de selo, aviso, linha selecionada | — |
| `-borda` | Borda do mesmo elemento | ≥ 3:1 sobre `--superficie-cartao` |

Familias: `marca`, `neutro`, `informacao`, `sucesso`, `atencao`, `perigo`.

Mapeamento das situacoes do dominio (Gate 3) para familias — a regra fica no
componente `SeloSituacao`, nao espalhada:

| Situacao | Familia | Texto obrigatorio |
|---|---|---|
| Em aberto, a vencer | `neutro` | "A vencer" |
| Vence hoje | `atencao` | "Vence hoje" |
| Vencida | `perigo` | "Vencida" |
| Paga / recebida / conciliada | `sucesso` | "Paga" … |
| Aguardando aprovacao | `informacao` | "Aguardando aprovação" |
| Cancelada, estornada | `neutro` + texto riscado | "Cancelada" |

**Cor nunca e o unico portador de significado** (principio 7): todo uso de
uma familia semantica vem acompanhado de texto ou icone. Ver
[`acessibilidade.md`](acessibilidade.md).

### Valores financeiros

`--cor-valor-positivo`, `-negativo`, `-neutro` e `-previsto`. O sinal (`-R$`)
e o rotulo ("Saída") vem sempre junto. Valor previsto e cinza e em italico
para nao ser confundido com realizado.

## 6. Estados

- Foco: `--cor-foco` + `--anel-foco`, aplicado globalmente por
  `:focus-visible`. Nunca removido sem substituicao equivalente.
- Desabilitado: `--opacidade-desabilitado` **e** `aria-disabled`/`disabled`;
  nunca so opacidade.
- Carregando: `--opacidade-carregando` na regiao que esta sendo atualizada, com
  esqueleto do tamanho final (principio 12).

## 7. Camadas (z-index)

Cinco valores, com folga de 100 entre eles. Nenhum componente inventa
`z-index: 9999`.

```text
conteudo 1 < barra 100 < gaveta 200 < dialogo 300 < aviso 400
```

## 8. Pontos de quebra

Custom properties nao funcionam dentro de `@media`, entao os valores sao
escritos literalmente nas *media queries* e espelhados em
`pontos-de-quebra.ts` (com teste que garante contiguidade). Estrategia e
comportamento em [`responsividade.md`](responsividade.md).

| Faixa | Largura |
|---|---|
| celular | ate 767px |
| tablet | 768px a 1023px |
| desktop | 1024px a 1439px |
| largo | 1440px ou mais |

## 9. Movimento

Duas duracoes (`120ms`, `200ms`). Com `prefers-reduced-motion: reduce`, ambas
viram `0.01ms` — o token muda, os componentes nao precisam saber.

## 10. Como acrescentar um token

1. Verifique se um token existente ja responde a pergunta (secao 2).
2. Nomeie pelo **uso**, nao pelo valor (`--cor-atencao-suave`, nunca
   `--amarelo-claro`).
3. Se for cor semantica, crie os tres tons e valide o contraste (secao 5).
4. Atualize a tabela correspondente neste documento.
