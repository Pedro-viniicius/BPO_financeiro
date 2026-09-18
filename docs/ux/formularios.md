# Formularios

> Gate 4 · Documento 9 — como pedimos dados sem cansar e sem induzir ao erro.

---

## 1. Estrutura em secoes

Nenhum formulario financeiro e uma coluna unica de 25 campos. Todos usam as
mesmas secoes, na mesma ordem, com os mesmos nomes:

```text
Informações principais     quem, o que, quando
Financeiro                 valor, forma de pagamento, conta, acréscimos
Classificação              categoria, centro de custo
Documentos                 anexos, número do documento, referência de pagamento
Informações adicionais     observação, campos raros            (recolhida)
```

Regras:

- As tres primeiras secoes ficam **abertas**; `Documentos` abre se ja houver
  anexo; `Informações adicionais` comeca recolhida.
- Nenhum campo **obrigatorio** dentro de secao recolhida.
- Cada secao tem titulo e, quando o vocabulario for tecnico, uma linha de
  explicacao ("Classificação define onde este valor aparece no resultado").
- Secao vazia nao existe: se a empresa nao usa centro de custo, a secao
  `Classificação` mostra so categoria.

## 2. Ordem dos campos

A ordem segue a frase que o usuario diria em voz alta:

> "Paguei **ao Moinho Real** **2.400 reais** de **farinha**, vence **dia 18**."

Logo: contraparte → valor → descricao → vencimento. A validacao de negocio mais
cara (duplicidade) so pode ser feita depois desses quatro campos — por isso
eles vem primeiro.

## 3. Valores padrao

| Campo | Padrao | Seguro porque |
|---|---|---|
| Data de emissao | hoje | Reversivel e quase sempre correto |
| Data de vencimento | vazio | Errar vencimento tem custo alto |
| Conta bancaria | ultima usada pelo usuario na empresa | Reversivel antes de confirmar |
| Categoria | a mais usada com aquele fornecedor | Sugestao visivel, marcada como "sugerido" |
| Centro de custo | vazio | Sugerir errado contamina o relatorio |
| Forma de pagamento | ultima usada | Reversivel |
| Numero de parcelas | 1 | O caso comum |
| Empresa | a empresa ativa | Repetida no titulo do formulario |

Criterio: **so damos padrao quando errar e barato e visivel**. Vencimento,
centro de custo e valor nunca vem preenchidos.

## 4. Campos monetarios

- Componente proprio (`CampoDinheiro`): alinhado a direita, tabular, mascara
  brasileira, `R$` como prefixo fixo fora do campo editavel.
- Aceita `1234,56`, `1.234,56` e `1234.56`; rejeita letras.
- **Nunca** usa `number` do HTML: a roda do mouse altera o valor sem querer.
- Valor zero e permitido apenas onde o dominio permite, e marcado.
- Valor negativo nao e digitado: o sinal vem do tipo de lancamento.
- Ao sair do campo, formata; ao entrar, mantem o texto editavel.

## 5. Datas

- Campo de texto com mascara `dd/mm/aaaa` **mais** calendario opcional. Digitar
  e mais rapido do que navegar no calendario — Rafael digita.
- Aceita `18/09`, completando o ano corrente, e `180926`.
- Atalhos: `hoje`, `ontem`, `+30` (trinta dias a frente).
- Vencimento em sabado, domingo ou feriado: aviso discreto, nunca bloqueio
  ("25/10 é um sábado.").
- Toda data mostrada tem quatro digitos de ano.

## 6. Selecao de entidade (fornecedor, cliente, categoria, conta)

- Campo de busca com resultados ao digitar, teclado completo (setas, `Enter`).
- Busca por nome, apelido e documento, tolerante a pontuacao e acento.
- **Criacao inline**: se nao encontrar, a ultima opcao e
  `+ Criar "Moinho Real"` — abre dialogo minimo (nome + documento opcional),
  cria e ja seleciona. Sem isso, Rafael abandona o lancamento.
- Mostra dado que desambigua (documento, cidade) quando ha homonimos.
- Item inativo nao aparece; se estava selecionado, aparece marcado `(inativo)`.

## 7. Parcelas e recorrencia

Duas coisas diferentes, nunca no mesmo controle:

| | Parcelamento | Recorrencia |
|---|---|---|
| O que e | Um compromisso dividido em N vezes | Um compromisso que se repete sem fim definido |
| Exemplo | Maquina em 12x | Aluguel todo dia 5 |
| Como aparece | `Parcelas: [12]` + pre-visualizacao da tabela | `Repetir: mensal` + `Até: [data/sem fim]` |

A **pre-visualizacao e obrigatoria** antes de salvar um parcelamento: mostra
as N linhas com data e valor, incluindo o ajuste de centavos da ultima parcela.
O usuario pode editar datas e valores individuais antes de confirmar.

## 8. Validacao

| Quando | O que |
|---|---|
| Ao digitar | Apenas formato (mascara). Nao acusamos erro em campo que a pessoa ainda esta preenchendo |
| Ao sair do campo (*blur*) | Validacao do campo: obrigatorio, formato, faixa |
| Antes de salvar | Validacao entre campos: vencimento antes da emissao, valor da parcela x total |
| No servidor | Sempre. A validacao da interface e conveniencia, nunca garantia |

Apresentacao do erro:

- Texto **abaixo do campo**, em vermelho **e** com icone, associado por
  `aria-describedby`;
- borda do campo marcada e `aria-invalid="true"`;
- resumo no topo apenas quando houver mais de tres erros, com links que levam
  ao campo;
- o foco vai para o primeiro campo invalido ao tentar salvar.

Texto do erro diz o que fazer: "Informe o vencimento." e melhor que
"Campo obrigatório."; "O vencimento não pode ser anterior à emissão (18/09)."
e melhor que "Data inválida.".

## 9. Salvar

| Botao | Quando aparece | Atalho |
|---|---|---|
| `Salvar` | Sempre | `Ctrl+Enter` |
| `Salvar e criar outra` | Telas de lancamento repetitivo | `Ctrl+Shift+Enter` |
| `Cancelar` | Sempre, como link discreto | `Esc` |

- O botao primario fica **a direita**, isolado; o destrutivo nunca fica ao lado.
- Enquanto salva: botao em estado ocupado, formulario bloqueado, sem trocar de
  tela — evita duplo envio.
- Falha ao salvar **nao limpa o formulario** e mostra o motivo no topo, com o
  campo culpado marcado quando houver.
- `Salvar e criar outra` mantem fornecedor, categoria, conta e data, limpa
  valor, descricao e documento — os campos que sempre mudam.

## 10. Sair sem salvar

Com alteracoes pendentes, sair pede confirmacao uma unica vez:

> **Descartar as alterações?**
> Você preencheu esta conta mas ainda não salvou.
> [Continuar editando] [Descartar]

Nao pedimos confirmacao quando nada foi alterado. Nao salvamos rascunho
automatico de lancamento financeiro (rascunho invisivel vira lancamento
fantasma).

## 11. Avisos que nao sao erros

| Situacao | Texto | Bloqueia? |
|---|---|---|
| Possivel duplicidade | "Uma conta parecida foi lançada em 12/09: Moinho Real, R$ 2.400,00. Ver conta." | Nao — `Salvar mesmo assim` |
| Valor muito acima da media do fornecedor | "Este valor é 4x maior que a média deste fornecedor." | Nao |
| Vencimento em fim de semana | "25/10 é um sábado." | Nao |
| Vencimento no passado | "Esta conta já está vencida e entrará como vencida." | Nao |
| Sem categoria | "Sem categoria, este valor aparece como Não classificado no resultado." | Nao |

Aviso usa cor e icone diferentes de erro, e nunca desabilita o botao de salvar.

## 12. Acessibilidade em formularios

Ver [`acessibilidade.md`](acessibilidade.md). Minimos obrigatorios:

- todo campo tem `<label>` real associado por `for`/`id` — nunca so
  *placeholder*;
- *placeholder* mostra formato, jamais o rotulo;
- campos obrigatorios marcados em texto (`obrigatório`), nao so com asterisco;
- agrupamentos usam `<fieldset>` + `<legend>`;
- erro associado ao campo por `aria-describedby`;
- ordem de tabulacao igual a ordem visual;
- nenhum campo depende de mouse (calendario e opcional, sempre digitavel).
