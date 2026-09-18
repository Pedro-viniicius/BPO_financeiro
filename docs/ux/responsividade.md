# Responsividade

> Gate 4 · Documento 13 — desktop primeiro, sem abandonar o celular.
> Codigo: [`src/interface/casca/`](../../src/interface/casca/) e as
> *media queries* de cada componente.

---

## 1. Estrategia: desktop primeiro

O trabalho financeiro denso — lancar 40 contas, conciliar 300 linhas, revisar
a DRE — acontece em desktop, com teclado e duas listas lado a lado. O celular
atende **consulta e aprovacao**: Marcia olha o `Disponível hoje` no caminho da
padaria; Beto aprova dois pagamentos na fila do banco.

Por isso o CSS e escrito para o desktop e **reduz** nas faixas menores
(`max-width`), o inverso do *mobile first*. Isso mantem o caso principal
simples e coloca as excecoes onde elas sao excecao.

## 2. Faixas

| Faixa | Largura | Barra lateral | Conteudo |
|---|---|---|---|
| **largo** | ≥ 1440px | fixa, expandida (240px) | ganha colunas adicionais (`Início`: blocos 4 e 5 lado a lado) |
| **desktop** | 1024–1439px | fixa, expandida | uma coluna, largura maxima 1440px |
| **tablet** | 768–1023px | compacta (64px, so icone + *tooltip*) | uma coluna, gutters menores |
| **celular** | ≤ 767px | escondida; painel deslizante via "Mais" | uma coluna, barra inferior fixa |

Os limites vivem em `pontos-de-quebra.ts` e sao repetidos literalmente nas
*media queries* (ver [`design-tokens.md`](design-tokens.md), secao 8).

## 3. A casca em cada faixa

```text
DESKTOP / LARGO                    TABLET                       CELULAR
+--------+-------------------+     +--+-------------------+     +-------------------+
| cabec. | empresa  busca  u |     |cb| empresa  busca  u |     | Financ.  empresa u|
+--------+-------------------+     +--+-------------------+     +-------------------+
| Inicio |                   |     |◉ |                   |     |                   |
| ------ |    conteudo       |     |◉ |    conteudo       |     |     conteudo      |
| OPERAC.|                   |     |◉ |                   |     |                   |
|  Pagar |                   |     |◉ |                   |     |                   |
|  Receb.|                   |     |  |                   |     +-------------------+
+--------+-------------------+     +--+-------------------+     |Início Pagar Receb.|
                                                                |            Mais   |
                                                                +-------------------+
```

- **Cabecalho**: mesma altura (56px) em todas as faixas — principio 12
  (estabilidade). No celular a busca e o papel do usuario somem; o seletor de
  empresa **nunca** some (lancar na empresa errada e o erro mais caro).
- **Barra inferior** (celular): quatro destinos fixos — `Início`, `Pagar`,
  `Receber`, `Mais`. `Mais` abre um painel deslizante com a navegacao completa
  (mesmo componente `NavegacaoLateral`, variante `painel`). O painel fecha ao
  navegar.
- **Painel aberto e janela cresce**: o painel fecha sozinho para nao existirem
  duas navegacoes ao mesmo tempo.

## 4. O que muda de tela para tela

| Tela | Desktop | Celular |
|---|---|---|
| `Início` | 6 blocos, 2 graficos | blocos 1–3 empilhados; graficos viram numero + link |
| Listas (contas, bancos) | tabela densa | cartoes: nome, valor, situacao, vencimento — 4 campos, nao 10 |
| Detalhe de titulo | pagina com secoes lado a lado | secoes empilhadas; acoes no rodape fixo |
| Formulario | gaveta de 480px | tela cheia |
| Conciliacao | duas colunas pareadas | **nao oferecida** (secao 5) |
| Resultados (DRE) | tabela com colunas de periodo | rolagem horizontal com primeira coluna fixa |

Regras gerais:

- toda tabela com mais de 4 colunas vira **cartao** no celular, com os campos
  escolhidos na definicao da coluna (propriedade a acrescentar em
  `ColunaTabela` quando a primeira lista for construida, no Gate 6); nunca
  tabela espremida;
- alvo de toque minimo `--alvo-toque-minimo` (44px) em qualquer elemento
  interativo em tablet e celular;
- a gaveta (`Gaveta`) ocupa a tela inteira no celular;
- campos de formulario usam `--texto-md` (16px) para o iOS nao dar zoom.

## 5. Conciliacao no celular: nao

A tarefa exige comparar duas listas lado a lado e arrastar/juntar itens. Uma
versao "empilhada" seria uma versao pior, e o usuario pagaria o preco em erros
de conciliacao. No celular a rota `/conciliacao` mostra: "A conciliação precisa de
uma tela maior. Abra no computador." — com o numero de linhas pendentes e o
link para `Bancos e caixa`.

Decisao registrada em [ADR-023](../decisoes/ADR-023-conciliacao-duas-colunas.md).

## 6. Como testar

- Verificar as quatro faixas em 360px, 800px, 1100px e 1500px.
- Em cada faixa: o item ativo da navegacao esta visivel? O seletor de empresa
  esta visivel? Existe rolagem horizontal indevida?
- `faixaDaLargura()` tem teste unitario; o comportamento visual e revisado a
  cada tela nova junto com a checklist de
  [`acessibilidade.md`](acessibilidade.md), secao 9.
