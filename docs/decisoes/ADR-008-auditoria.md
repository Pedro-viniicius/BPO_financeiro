# ADR-008 — Auditoria financeira somente insercao

**Status:** Aceita · 2026-09-18

## Contexto

Toda alteracao financeira precisa ser rastreavel: quem, quando, o que mudou.
Logs tecnicos nao servem (rotacionam, podem ser filtrados, nao sao
estruturados por entidade). Auditoria nao pode ser editada por usuarios comuns.

## Decisao

Tabela `eventos_auditoria` (`src/nucleo/auditoria/`) com: acao, entidade,
`entidade_id`, `dados_antes`, `dados_depois` (jsonb com apenas campos
relevantes), usuario, organizacao, empresa, origem (interface/importacao/
api/tarefa/sistema), IP, agente do navegador, id da requisicao, instante.

Protecoes verificadas no Gate 2 em PostgreSQL real:
1. usuario da aplicacao **nao tem** UPDATE/DELETE/TRUNCATE na tabela;
2. gatilho `auditoria_somente_insercao` rejeita UPDATE/DELETE para qualquer
   usuario (inclusive migracao);
3. o registrador (`RegistradorAuditoria`) so oferece `registrar`.

O caso de uso monta o evento e o grava **na mesma transacao** da operacao
(a implementacao Drizzle recebe a transacao). Vocabulario de acoes centralizado
em `ACOES_AUDITORIA` (`conta_pagar.criada`, `conciliacao.realizada`,
`usuario.permissao_alterada`...).

Logs tecnicos (`nucleo/observabilidade`) sao separados e redigem chaves
sensiveis automaticamente.

## Alternativas consideradas

- **Gatilhos de banco gravando toda linha alterada** — rejeitado: gera ruido
  (colunas tecnicas), nao sabe "quem" nem "por que" e nao distingue origem.
- **Servico de auditoria externo** — desnecessario; incompativel com servidor local.

## Consequencias positivas

- Prova de conformidade para o contador/auditor.
- Base para "Historico" e "Desfazer" na interface.

## Consequencias negativas

- Crescimento da tabela: particionamento por mes e retencao (LGPD) a definir
  no Gate 10. Retencao exige procedimento documentado que desative o gatilho.

## Riscos

- Gravar dados sensiveis em `dados_antes/depois`. Mitigacao: o caso de uso
  escolhe os campos; revisao de codigo; nunca senhas/tokens/dados bancarios.

## Criterios para revisao futura

Se a tabela passar de dezenas de milhoes de linhas, particionar; se exigencia
regulatoria pedir, exportar para armazenamento imutavel externo.
