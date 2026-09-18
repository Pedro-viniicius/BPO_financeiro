# ADR-015 — Dinheiro em centavos inteiros (BigInt) + NUMERIC no banco

**Status:** Aceita · 2026-09-18

## Contexto

`0.1 + 0.2 !== 0.3` em JavaScript. Um sistema financeiro que some centavos com
ponto flutuante produz diferencas de conciliacao inexplicaveis. Precisamos de
uma representacao exata, regras de arredondamento explicitas e suporte a
percentuais (juros, margens) sem perder precisao.

## Decisao

`src/compartilhado/dinheiro/`:

- **`Dinheiro`**: valor imutavel guardado como `bigint` de centavos + moeda
  (`BRL` por padrao; a estrutura aceita outras). Sem dependencias externas.
  Operacoes: somar, subtrair, negar, aplicar percentual, multiplicar por
  fator/inteiro, dividir em parcelas (soma exata, sobra distribuida nas
  primeiras), comparar, percentual sobre base.
- **`Percentual`**: 4 casas decimais fixas (5,2575%), tambem em `bigint`.
- **Arredondamento explicito**: `comercial` (meio para cima, afastando do
  zero) e o padrao; `para-baixo` e `para-cima` disponiveis. Nenhuma operacao
  arredonda escondido.
- **Banco**: `NUMERIC(15,2)` (ate R$ 9,99 trilhoes). O driver devolve texto;
  `Dinheiro.deTexto("1234.56")` converte. Nunca `number`.
- **Entrada do usuario**: `Dinheiro.deTextoBrasileiro("1.234,56")`.
- **Saida**: `formatarBrasileiro()` → `R$ 1.234,56`; `paraTexto()` → `1234.56`
  para banco e APIs; JSON `{ valor, moeda }`.
- Percentuais e taxas de juros que precisem de mais casas no futuro
  (ex.: taxa diaria) usarao um tipo `Taxa` proprio, nao `number`.

22 testes cobrem os casos de borda (0,1+0,2; parcelas com sobra; negativos;
arredondamento por regra; formatacao).

## Alternativas consideradas

- **`number` com `toFixed(2)`** — rejeitado: erros acumulados.
- **decimal.js / big.js** — bons, mas trazem dependencia e aritmetica
  arbitraria que o dominio nao precisa; `bigint` nativo cobre tudo com
  regras mais simples de auditar.
- **Inteiro em `number` (centavos)** — funciona ate 2^53, mas `bigint`
  remove o risco e deixa a intencao explicita.

## Consequencias positivas

- Somas de milhares de lancamentos batem ao centavo.
- Parcelamento e rateio deterministas e testados.

## Consequencias negativas

- `bigint` nao serializa em JSON nativamente — resolvido com `toJSON()`.
- Multiplicacoes com muitas casas exigem passar por `Percentual`/fator em
  texto, o que e intencional.

## Riscos

- Alguem usar `Number(valor)` em um componente. Mitigacao: revisao; regra de
  lint especifica pode ser adicionada no Gate 5.

## Criterios para revisao futura

Multi-moeda funcional (conversao) exigira tabela de cotacoes e revisao deste ADR.
