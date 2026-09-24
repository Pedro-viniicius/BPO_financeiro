# Registro de testes de restauracao

> Politica: **backup nunca restaurado nao e backup.** Um teste por mes, e
> sempre antes de uma implantacao grande. Cada linha abaixo e um teste que
> alguem realmente executou — nao um plano.

Como executar (o procedimento esta em `docs/operacao/implantacao-vps.md`):

```sh
# 1. backup avulso
docker compose -f docker-compose.producao.yml run --rm backup /backup.sh

# 2. restaurar num banco SEPARADO e comparar as contagens com a origem
docker compose -f docker-compose.producao.yml run --rm \
  -e BANCO_ORIGEM=financeiro -e PGUSER=financeiro_admin \
  --entrypoint /restaurar.sh backup /backups/<arquivo>.dump

# 3. (Gate 10) restaurar tambem os ANEXOS do remoto e conferir chave a chave
docker compose -f docker-compose.producao.yml run --rm \
  -e BANCO_ORIGEM=financeiro -e PGUSER=financeiro_admin \
  -e ARQUIVOS_RESTAURACAO=/backups/arquivos-restaurados \
  --entrypoint /restaurar.sh backup /backups/<arquivo>.dump
```

Com `ARQUIVOS_RESTAURACAO`, o script copia `BACKUP_REMOTO_DESTINO/arquivos`
para a pasta e reprova se qualquer arquivo VIVO no banco restaurado nao tiver
conteudo — "o lancamento voltou, a nota fiscal nao" e falha, nao aviso.

O script compara, tabela a tabela, a contagem EXATA de linhas entre a origem e
o banco restaurado, e reprova se qualquer uma divergir. Conferir so `empresas`
e `eventos_auditoria`, como era antes, deixaria passar um dump truncado no
meio dos lancamentos.

## Testes executados

| Data | Onde | Dump | Resultado | Quem | Observacoes |
|---|---|---|---|---|---|
| 2026-09-23 | maquina de desenvolvimento (Docker) | `financeiro-20260923-013132.dump` (652 KB) | **APROVADO** — 50 tabelas, 5.747 linhas, contagens iguais em todas | Gate 9 | Primeiro teste do projeto. Dados vindos da propria aplicacao (empresa, fornecedor, plano de contas, conta bancaria, titulo parcelado em 3x com a 1a parcela liquidada e a movimentacao bancaria correspondente). Conferencia por amostra alem das contagens: o titulo, as tres parcelas com suas situacoes e o pagamento voltaram integros. |
| 2026-09-24 | maquina de desenvolvimento (imagem `financeiro-backup` + `rclone` com destino local) | `financeiro-20260924-082752.dump` (684 KB) | **APROVADO** — 57 tabelas, 5.867 linhas, contagens iguais; **3 anexos vivos restaurados do remoto, chave a chave** | Gate 10 | Primeiro teste que cobre os ANEXOS. Antes do backup, a retencao expurgou um documento com arquivo unico (12 MB): o arquivo saiu do disco, e o backup o apagou do remoto **pela lista de chaves expurgadas** (1 chave), mantendo os 3 vivos. Um documento cujas fotos eram compartilhadas por hash com outros vivos foi expurgado SEM remover arquivo — correto. Achado corrigido nos scripts: `financeiro_backup` nao tinha SELECT nas sequencias e o `pg_dump` falhava. |

## Pendente

- [ ] Repetir **no VPS**, com os dados reais da Nova Didata, antes de o cliente
      receber acesso. Um teste na maquina de desenvolvimento prova os scripts;
      nao prova o servidor, o volume nem o destino remoto.
- [ ] Testar a restauracao a partir da **copia remota** (baixar do destino
      rclone e restaurar), nao so do arquivo local. E a copia remota que
      responde pelo caso de o VPS sumir. (Os ANEXOS ja sao restaurados do
      remoto pelo script; falta o proprio dump.)
- [ ] Testar a restauracao de um backup **cifrado com GPG**, com a chave
      privada guardada fora do servidor.
