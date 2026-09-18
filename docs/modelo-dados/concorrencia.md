# Concorrencia e Idempotencia

> Duas pessoas (ou dois processos) fazendo a mesma coisa ao mesmo tempo nao
> podem produzir dois registros onde so cabe um. A defesa e do BANCO
> (restricoes e locks), nunca um `if (nao existe) then insert` no codigo.
> Testes: `src/banco-dados/testes/concorrencia.teste.ts`.

## Principio

`SELECT` seguido de `INSERT` no codigo tem uma janela entre os dois em que
outra transacao pode inserir. Por isso:

| Situacao | Defesa no banco | Como o codigo reage |
|---|---|---|
| Mesmo arquivo importado duas vezes | `unico_extratos_impressao (conta, impressao_digital)` | captura 23505 e responde "este arquivo ja foi importado em <data>" |
| Mesmo lancamento do banco (FITID) em dois arquivos | `unico_itens_extrato_identificador (conta, identificador_externo)` parcial | linha marcada como "ja importada" na pre-visualizacao; na confirmacao, 23505 → nada gravado |
| CSV sem FITID, mesma linha | `unico_itens_extrato_impressao (conta, impressao_digital_linha)` | idem |
| Dois pagamentos simultaneos da mesma parcela | `SELECT ... FOR UPDATE` na parcela: o segundo espera e reavalia `valor_pago` | se ja liquidada → `PagamentoJaRegistrado` |
| Duas conciliacoes do mesmo item | `unico_conciliacao_item_ativo (item) WHERE ativo` | 23505 → `MovimentacaoJaConciliada` |
| Dois codigos CP-2026-000123 | `unico_titulos_pagar_codigo` + `sequencias_codigo` com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (lock de linha) | nunca acontece: 20 transacoes paralelas geram 20 codigos distintos (testado) |
| Mesma pessoa cadastrada duas vezes | `unico_pessoas_documento (organizacao, cpf_cnpj)` | "ja existe pessoa com este CPF/CNPJ: <nome>" |
| Mesmo documento do fornecedor lancado duas vezes | `unico_titulos_pagar_documento (fornecedor, numero_documento) WHERE nao cancelado` | aviso de duplicidade provavel; usuario decide |
| Mesma tarefa enfileirada duas vezes | `tarefas_chave_idempotencia_idx` | `enfileirar` devolve `null` |
| Dois executores pegando a mesma tarefa | `FOR UPDATE SKIP LOCKED` | cada um pega uma linha diferente |
| Webhook reenviado | `chave_idempotencia` da tarefa = id do evento externo | segundo envio nao cria tarefa |
| Duas aprovacoes simultaneas do mesmo titulo | `FOR UPDATE` no titulo; segunda ve `situacao = aberto` | `TransicaoSituacaoInvalida` |

## Locks: quando e quais

- **`FOR UPDATE` em uma linha**: ao mudar estado de titulo, parcela,
  pagamento, conciliacao, recorrencia. Curto: dentro da transacao do caso de uso.
- **`FOR UPDATE SKIP LOCKED`**: so na fila de tarefas.
- **Ordem fixa de travamento** para evitar deadlock (dois processos esperando
  um pelo outro): titulo → parcelas → pagamentos; conciliacao → itens → movimentacoes.
  Sempre travar do pai para o filho, em ordem de id quando houver varios.
- **Nunca** lock de tabela inteira (`LOCK TABLE`) nem `SERIALIZABLE`.

## Colunas de identificacao externa (significados distintos)

| Coluna | Onde | Significa |
|---|---|---|
| `identificador_externo` | itens de extrato | id que o BANCO deu ao lancamento (FITID). Unico por conta. |
| `impressao_digital` | extratos, arquivos | SHA-256 do CONTEUDO do arquivo. Detecta o mesmo arquivo com outro nome. |
| `impressao_digital_linha` | itens de extrato | SHA-256 de (conta, data, tipo, valor, descricao, posicao). Idempotencia quando nao ha FITID. |
| `chave_idempotencia` | tarefas | chave escolhida pelo produtor (ex.: id do webhook, hash do arquivo) para nao repetir trabalho. |
| `numero_documento` | titulos, pagamentos | numero do documento de negocio (nota, boleto). Unico por fornecedor/empresa quando informado. |
| `codigo` | titulos, dividas | identificador legivel gerado pelo sistema. |

Nao existe `referencia_externa` generica: cada coluna acima tem um significado unico.

## Derivados mantidos na transacao (risco de divergir)

`parcelas_*.valor_pago/valor_recebido`, `parcelas_*.situacao`,
`titulos_*.valor_total`, `extratos.quantidade_itens`. Sao atualizados sob o
mesmo lock da operacao. Consulta de conferencia (rodar na CI do Gate 5 e em
producao periodicamente):

```sql
-- parcelas cujo valor_pago diverge da soma dos pagamentos registrados
SELECT p.id, p.valor_pago, COALESCE(SUM(pg.valor_principal), 0) AS soma
FROM parcelas_pagar p
LEFT JOIN pagamentos pg ON pg.parcela_pagar_id = p.id AND pg.situacao = 'registrado'
GROUP BY p.id, p.valor_pago
HAVING p.valor_pago <> COALESCE(SUM(pg.valor_principal), 0);
```

Resultado esperado: zero linhas. Se houver, e bug de caso de uso, nao de dado.
