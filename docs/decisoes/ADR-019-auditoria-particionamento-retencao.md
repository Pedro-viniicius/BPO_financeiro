# ADR-019 — Auditoria: sem particionamento agora, com limiar definido

**Status:** Aceita · 2026-09-18 · Complementa a ADR-008

## Contexto

`eventos_auditoria` cresce sem parar: toda criacao, alteracao, baixa, estorno e
conciliacao gera uma linha com `dados_antes`/`dados_depois` em JSONB. Particionar
por mes (`PARTITION BY RANGE (ocorrido_em)`) e a solucao classica, mas
particionamento exige criacao periodica de particoes, afeta migracoes,
complica backups e e mais uma peca para o cliente que hospeda sozinho manter.

## Estimativa de volume

Base de calculo para uma empresa pequena/media ativa:

| Item | Quantidade |
|---|---|
| Lancamentos por dia (pagar + receber) | ~60 |
| Eventos por lancamento (criar, alterar, baixar, conciliar) | ~4 |
| Itens de extrato conciliados/dia | ~60 |
| Eventos de cadastro e configuracao/dia | ~10 |
| **Total/dia** | **~310 eventos** |
| Por ano (250 dias uteis) | ~78 mil |
| Tamanho medio por linha (com JSONB) | ~1,5 KB |
| **Por ano** | **~115 MB** |

Escritorio de BPO com 30 empresas: ~2,3 milhoes de eventos/ano, ~3,5 GB/ano.
Uma tabela PostgreSQL com indices adequados atende dezenas de milhoes de
linhas sem particionamento; as consultas de auditoria sao sempre filtradas por
`empresa_id` + faixa de data (indice `eventos_auditoria_empresa_data_idx`) ou
por entidade (`eventos_auditoria_entidade_idx`).

## Decisao

1. **Nao particionar agora.** Manter tabela unica com os tres indices atuais.
2. **Limiar objetivo para reavaliar**: qualquer um destes gatilhos abre a
   discussao de particionamento:
   - tabela acima de **20 GB**, ou
   - acima de **50 milhoes de linhas**, ou
   - consulta de auditoria de uma empresa em um mes levando mais de **2 s**, ou
   - janela de `pg_dump` ultrapassando o tempo aceitavel por causa dela.
3. **Monitorar** o tamanho semanalmente (`observabilidade.md`).
4. **Retencao**: definida no Gate 10 junto com a politica LGPD. Diretriz atual:
   - eventos financeiros: **minimo 5 anos** (prazo de guarda de documentos
     fiscais/comerciais; a definir com o juridico);
   - eventos puramente tecnicos (login, alteracao de preferencia): 12 meses.
5. **Como apagar quando houver retencao**: procedimento documentado e auditado
   que (a) exporta o periodo para arquivo assinado, (b) desativa o gatilho
   `auditoria_somente_insercao` em transacao, (c) apaga a faixa, (d) reativa o
   gatilho. Executado pelo administrador do banco, nunca pela aplicacao.

## Alternativas consideradas

- **Particionar por mes desde ja** — rejeitada: complexidade permanente
  (criacao de particoes, migracoes, backup) para um problema que so aparece em
  anos; o cliente do Modelo C teria mais uma rotina para operar.
- **Particionar por empresa** — rejeitada: numero de particoes cresce com
  clientes do BPO; consultas por periodo atravessariam todas.
- **Arquivar em outra tabela/banco desde ja** — rejeitada: mesma complexidade,
  sem necessidade demonstrada.
- **Tabela sem JSONB (so texto do que mudou)** — rejeitada: perderia a
  capacidade de mostrar "valor anterior x valor novo" campo a campo, que e
  requisito do Gate 1.

## Consequencias positivas

- Nada a operar no dia a dia; backup e restauracao continuam simples.
- Auditoria continua sendo uma tabela que qualquer pessoa consulta com SQL comum.

## Consequencias negativas

- Se um cliente crescer muito rapido, a migracao para tabela particionada sera
  feita com a tabela ja grande (exige janela de manutencao).
  Mitigacao: o monitoramento avisa muito antes; a migracao pode ser feita com
  `CREATE TABLE ... PARTITION BY` + copia em lotes + troca de nome.

## Riscos

- Ninguem olhar o tamanho da tabela. Mitigacao: item fixo na lista de
  observabilidade e verificacao mensal junto com o teste de restauracao.

## Criterios para revisao futura

Os gatilhos da secao "Decisao", item 2; ou exigencia regulatoria de exportacao
para armazenamento imutavel externo.
