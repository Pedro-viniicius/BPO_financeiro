# Modelo de Dados (Gate 3)

> O banco e o guardiao da verdade dos dados: ele impede estados impossiveis.
> A aplicacao implementa o comportamento do negocio.

## Por onde comecar

1. [`modelo-conceitual.md`](modelo-conceitual.md) — o negocio real, entidades, agregados, invariantes. Leia primeiro.
2. [`diagrama-geral.md`](diagrama-geral.md) — o desenho de tudo, em uma pagina.
3. [`glossario.md`](glossario.md) — competencia, vencimento, baixa, estorno, conciliacao...
4. Uma categoria em [`categorias/`](categorias/) — cada uma com tabelas, campos, regras, exemplos e diagrama.

## Documentos

| Documento | Responde |
|---|---|
| [modelo-conceitual.md](modelo-conceitual.md) | O que existe no negocio e como se relaciona |
| [diagrama-geral.md](diagrama-geral.md) | Como as tabelas se ligam (visao geral) |
| [dicionario-dados.md](dicionario-dados.md) | O que cada tabela e cada campo importante significa |
| [glossario.md](glossario.md) | O que os termos financeiros querem dizer |
| [padrao-nomenclatura.md](padrao-nomenclatura.md) | Como nomear tabelas, colunas, indices, restricoes, enums |
| [pertencimento-dados.md](pertencimento-dados.md) | A quem cada tabela pertence (instalacao, organizacao, empresa, filial) |
| [ciclo-vida.md](ciclo-vida.md) | Estados e transicoes de cada entidade; o que pode ser apagado |
| [transacoes.md](transacoes.md) | Quais operacoes precisam ser atomicas e como |
| [concorrencia.md](concorrencia.md) | O que acontece quando duas pessoas fazem a mesma coisa ao mesmo tempo |
| [indices.md](indices.md) | Cada indice, a consulta que ele serve e o custo |
| [anexos.md](anexos.md) | Onde ficam os arquivos e o que o banco guarda |
| [observabilidade.md](observabilidade.md) | O que medir no banco em producao |

## Categorias

| Categoria | Tabelas | Documento |
|---|---|---|
| Estrutura empresarial | organizacoes, empresas, filiais, vinculos_usuario | [estrutura-empresarial.md](categorias/estrutura-empresarial.md) |
| Pessoas | pessoas, clientes, fornecedores, anexos_pessoas | [pessoas.md](categorias/pessoas.md) |
| Bancos | instituicoes_bancarias, contas_bancarias | [bancos.md](categorias/bancos.md) |
| Classificacao financeira | contas_plano, categorias_financeiras, centros_custo | [classificacao-financeira.md](categorias/classificacao-financeira.md) |
| Contas a pagar | titulos_pagar, parcelas_pagar, pagamentos, recorrencias_pagar, anexos_* | [contas-pagar.md](categorias/contas-pagar.md) |
| Contas a receber | titulos_receber, parcelas_receber, recebimentos, recorrencias_receber, contatos_cobranca, anexos_* | [contas-receber.md](categorias/contas-receber.md) |
| Movimentacoes | movimentacoes_bancarias, transferencias | [movimentacoes.md](categorias/movimentacoes.md) |
| Extratos | extratos_bancarios, itens_extrato_bancario | [extratos.md](categorias/extratos.md) |
| Conciliacao | conciliacoes_bancarias, conciliacoes_itens_extrato, conciliacoes_movimentacoes | [conciliacao.md](categorias/conciliacao.md) |
| Tesouraria | (sem tabelas: consultas) | [tesouraria.md](categorias/tesouraria.md) |
| Credito e dividas | dividas, parcelas_divida, pagamentos_divida, anexos_dividas | [credito-dividas.md](categorias/credito-dividas.md) |
| Orcamento | orcamentos, itens_orcamento | [orcamento.md](categorias/orcamento.md) |
| DRE | (sem tabelas: consultas sobre contas_plano) | [dre.md](categorias/dre.md) |
| Auditoria | eventos_auditoria | [auditoria.md](categorias/auditoria.md) |
| Anexos e plataforma | arquivos, sequencias_codigo, tarefas, eventos_saida | [anexos.md](anexos.md) |

Onde esta o codigo: `src/banco-dados/LEIA-ME.md`.

## Decisoes do Gate 3

- [ADR-017 — Seguranca por linha (RLS)](../decisoes/ADR-017-seguranca-por-linha.md): avaliada; **nao adotada agora**, com controles compensatorios.
- [ADR-018 — Titulos a pagar e a receber separados](../decisoes/ADR-018-titulos-pagar-receber-separados.md): estruturas paralelas, sem tabela generica.
- [ADR-019 — Auditoria sem particionamento por enquanto](../decisoes/ADR-019-auditoria-particionamento-retencao.md): limiar e plano de retencao.

## Adiado conscientemente (nao e esquecimento)

| Item | Motivo | Quando |
|---|---|---|
| Faturas / documentos de cobranca (`faturamento`) | depende de decisoes de UX e de adaptadores PIX/boleto | Gate 6 / Fase 2 |
| Premissas de previsao de caixa como tabela | primeira versao usa premissas fixas no codigo | Gate 7 |
| Periodo fechado (`periodos_fechados`) | fechamento gerencial exige fluxo de UX; modelo permite adicionar sem quebrar nada | Gate 8 |
| Linhas de credito (limite disponivel) | nao ha demanda no MVP | Fase 2 |
| Enderecos de pessoas | o financeiro nao precisa; faturamento talvez | Gate 6 |
| Rateio de um titulo entre varios centros de custo | complexidade sem demanda | Fase 2 |
| Multi-moeda funcional | `Dinheiro` ja carrega moeda; conversao nao | Fase 3 |
| Semente de instituicoes bancarias (lista do Banco Central) | dado de referencia, nao estrutura | Gate 5 |
| Seguranca por linha (RLS) | ADR-017 | reavaliar no Gate 10 |
| Particionamento da auditoria | ADR-019 | ao atingir o limiar |
