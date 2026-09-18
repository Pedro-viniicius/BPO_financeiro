# Transacoes

> Uma transacao e um conjunto de gravacoes que acontece por inteiro ou nao
> acontece. Se qualquer passo falhar, o PostgreSQL desfaz todos os anteriores.
> Teste: `src/banco-dados/testes/transacoes.teste.ts`.

## Como usar no codigo

```ts
import { executarEmTransacao } from "@/nucleo/banco-dados/publico";

await executarEmTransacao(async (transacao) => {
  // todo repositorio e servico recebe `transacao` (tipo ExecutorBancoDados)
  await repositorioParcelas.reservarParaPagamento(transacao, parcelaId);   // SELECT ... FOR UPDATE
  await repositorioMovimentacoes.registrar(transacao, movimentacao);
  await repositorioPagamentos.registrar(transacao, pagamento);
  await repositorioParcelas.atualizarValorPago(transacao, parcelaId, novoValor);
  await auditoria.registrar(transacao, evento);                            // RegistradorAuditoriaDrizzle(transacao)
  await eventos.publicar(transacao, eventoDominio);                        // PublicadorEventosSaida(transacao)
});
```

Regras:
- A transacao e aberta pelo **caso de uso**, nunca pelo repositorio.
- Repositorios recebem `ExecutorBancoDados` (conexao OU transacao) e nunca
  abrem transacao propria.
- Nada de chamada externa (API, e-mail) dentro da transacao: enfileire uma
  tarefa (ela e gravada na mesma transacao) e deixe o executor fazer a chamada.
- Transacoes curtas: leia o que precisa, trave o minimo, grave, saia.
- Erros de dominio (`Resultado` com falha) lancados dentro da transacao
  tambem a desfazem; o caso de uso converte em resposta depois.

## Transacoes de negocio importantes

| Operacao | Passos que precisam ser atomicos | Lock |
|---|---|---|
| **Registrar pagamento** | 1) travar parcela · 2) validar situacao/valor · 3) inserir movimentacao (saida) · 4) inserir pagamento · 5) atualizar `valor_pago`/`situacao` da parcela · 6) auditoria · 7) evento `conta_pagar.pagamento_registrado` | `SELECT ... FOR UPDATE` na parcela |
| **Estornar pagamento** | 1) travar pagamento e parcela · 2) validar `situacao = registrado` · 3) inserir movimentacao inversa (`origem = estorno`) · 4) marcar pagamento estornado · 5) recalcular `valor_pago`, parcela volta a `aberta` · 6) auditoria · 7) evento | pagamento e parcela |
| **Registrar recebimento / estornar** | identico, com entrada | parcela |
| **Criar titulo com parcelas** | 1) gerar codigo (`sequencias_codigo`, lock de linha) · 2) inserir titulo · 3) inserir N parcelas · 4) conferir Σ = `valor_total` · 5) auditoria | linha da sequencia |
| **Cancelar titulo** | 1) travar titulo e parcelas · 2) verificar que nenhuma parcela tem pagamento `registrado` · 3) parcelas → canceladas · 4) titulo → cancelado com motivo · 5) auditoria · 6) evento | titulo |
| **Aprovar titulo** | 1) travar titulo · 2) verificar `aguardando_aprovacao` e aprovador ≠ criador (tambem CHECK) · 3) → aberto · 4) auditoria | titulo |
| **Transferencia entre contas** | 1) inserir movimentacao saida · 2) inserir movimentacao entrada · 3) inserir transferencia ligando as duas · 4) auditoria | — (insercoes) |
| **Importar extrato** (confirmacao) | 1) inserir extrato (impressao unica) · 2) inserir todos os itens (FITID/impressao unicos) · 3) atualizar `quantidade_itens` · 4) auditoria · 5) enfileirar tarefa de sugestao de conciliacao. Qualquer duplicidade → nada gravado | — (unicidade) |
| **Reverter extrato** | 1) DELETE do extrato (CASCADE nos itens; RESTRICT se algum conciliado) · 2) auditoria | — |
| **Conciliar** | 1) travar itens e movimentacoes envolvidos · 2) verificar que nenhum tem vinculo ativo (tambem indice unico) · 3) conferir Σ itens = Σ movimentacoes · 4) inserir conciliacao + vinculos · 5) auditoria | itens e movimentacoes (`FOR UPDATE`) |
| **Criar movimentacao a partir do extrato** ("isso e tarifa") | 1) inserir movimentacao (`origem = extrato`, categoria obrigatoria) · 2) conciliar (passos acima) | item |
| **Desfazer conciliacao** | 1) travar conciliacao · 2) marcar `desfeita_em` + motivo · 3) vinculos `ativo = false` · 4) auditoria | conciliacao |
| **Pagar parcela de divida** | igual a pagamento, atualizando `parcelas_divida.situacao`; quando a ultima e paga, divida → quitada | parcela |
| **Gerar titulos de recorrencia** (tarefa) | por recorrencia: 1) travar recorrencia · 2) para cada competencia ate hoje+janela: inserir titulo+parcela (idempotente por `recorrencia_id` + competencia) · 3) avancar `proxima_geracao` | recorrencia |
| **Apagar rascunho** | 1) verificar `situacao = rascunho` e sem pagamentos · 2) DELETE parcelas · 3) DELETE titulo · 4) auditoria | titulo |

## Isolamento

Nivel padrao do PostgreSQL (`READ COMMITTED`) e suficiente para todas as
operacoes acima porque os locks de linha (`FOR UPDATE`) e as restricoes
unicas fazem o trabalho. Nao usamos `SERIALIZABLE` (custo e retentativas
desnecessarias). Ver `concorrencia.md`.

## O que fica FORA da transacao

- Envio de e-mail, chamada a banco/IA: tarefa em segundo plano.
- Calculo de saldos e projecoes: leituras, sem transacao.
- Gravacao do arquivo no armazenamento: **antes** da transacao (se a
  transacao falhar, uma rotina remove arquivos sem metadados).
