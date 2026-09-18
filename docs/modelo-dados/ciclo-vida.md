# Ciclo de Vida das Entidades

> Toda mudanca de estado passa por uma operacao de dominio com nome
> (`registrarPagamento`, `cancelarTitulo`, `estornarPagamento`), nunca por
> `update({ situacao })` solto. Os estados abaixo sao os gravados; os
> derivados aparecem entre parenteses.

## Titulo a pagar

```
rascunho ──▶ aberto ──────────────────────▶ (pago: todas as parcelas liquidadas)
   │            │
   │            └──▶ cancelado  (so se nenhuma parcela tiver pagamento nao estornado)
   ▼
cancelado
                  com segregacao de funcoes ligada:
rascunho ──▶ aguardando_aprovacao ──▶ aberto      (aprovador ≠ criador: CHECK)
                      └──▶ rascunho (recusado)
```
- Pode ser **apagado fisicamente** apenas em `rascunho` sem parcelas com pagamento
  (nunca virou historia). A partir de `aberto`, so cancelamento.
- `valor_total` e `quantidade_parcelas` sao mantidos pela operacao que altera parcelas.

## Parcela a pagar

```
aberta ──▶ liquidada         (valor_pago >= valor_original, via registrarPagamento)
  │  ▲
  │  └── estornarPagamento devolve para aberta
  └──▶ cancelada             (junto com o titulo)
(parcial)  = aberta com 0 < valor_pago < valor_original
(vencida)  = aberta com data_vencimento < hoje
```

## Pagamento

```
registrado ──▶ estornado   (unica transicao; cria movimentacao inversa; nunca apagado)
```

## Titulo / parcela a receber

Igual ao pagar, sem `aguardando_aprovacao`, com:
```
parcela: aberta ──▶ perdida   (baixa por perda: saldo incobravel; reversivel apenas por nova operacao explicita)
```
"Atrasada" = aberta com vencimento < hoje.

## Recebimento

`registrado ──▶ estornado`.

## Movimentacao bancaria

Imutavel. Nao tem estados. "Estornar" = criar outra movimentacao com
`origem = 'estorno'` e `movimentacao_estornada_id` apontando para a original
(uma original so pode ter um estorno: indice unico). Nunca apagada.
"Conciliada" = existe vinculo ativo em `conciliacoes_movimentacoes`.

## Transferencia

Imutavel. Para desfazer, estornam-se as duas movimentacoes.

## Extrato bancario

```
importado ──▶ (revertido = apagado fisicamente, com os itens)
```
Permitido apenas se nenhum item tiver vinculo de conciliacao (FK RESTRICT
bloqueia). E dado tecnico reimportavel; por isso a excecao a regra de nao apagar.

## Item de extrato

Sem coluna de estado. Derivados: `pendente` (sem vinculo ativo e sem
`ignorado_em`), `conciliado` (vinculo ativo), `ignorado` (`ignorado_em`
preenchido, com motivo). Ignorar e reversivel (limpar os dois campos).

## Conciliacao

```
ativa (desfeita_em nulo) ──▶ desfeita   (vinculos passam a ativo = false; nada apagado)
```
Uma conciliacao desfeita nunca volta a ativa: cria-se outra.

## Divida

```
ativa ──▶ quitada (todas as parcelas pagas) | cancelada (contrato desfeito, sem pagamentos)
parcela: aberta ──▶ paga | cancelada ; pagamento: registrado ──▶ estornado
```

## Orcamento

```
rascunho ──▶ ativo ──▶ encerrado
```
Apagavel fisicamente em `rascunho` (itens vao junto: CASCADE). `ativo` e
`encerrado` sao historico gerencial: apenas encerrar.

## Pessoa, cliente, fornecedor, categoria, conta do plano, centro de custo, conta bancaria

`ativo/ativa = true ──▶ false` (desativacao). Nunca apagados se referenciados
(FK RESTRICT). Apagaveis se nunca usados (sem referencias) — decisao da aplicacao.

## Arquivo

Metadados permanentes. `removido_em` marca que o conteudo saiu do
armazenamento (retencao/LGPD); vinculos (`anexos_*`) podem ser apagados
(sao apenas ligacoes).

## Registros tecnicos (podem ser apagados)

`tarefas` concluidas apos N dias; `eventos_saida` publicados apos N dias;
`session` expiradas; `verification` vencidas. Rotina no Gate 5.

## Regra geral

| Situacao | Acao |
|---|---|
| Registro incompleto que nunca gerou dinheiro | apagar e permitido |
| Registro que gerou ou representa dinheiro | cancelar / estornar / desfazer, nunca apagar |
| Cadastro referenciado | desativar |
| Dado tecnico reconstruivel | apagar com regras |
| Auditoria | nunca (somente insercao) |
