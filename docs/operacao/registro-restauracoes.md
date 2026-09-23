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
```

O script compara, tabela a tabela, a contagem EXATA de linhas entre a origem e
o banco restaurado, e reprova se qualquer uma divergir. Conferir so `empresas`
e `eventos_auditoria`, como era antes, deixaria passar um dump truncado no
meio dos lancamentos.

## Testes executados

| Data | Onde | Dump | Resultado | Quem | Observacoes |
|---|---|---|---|---|---|
| 2026-09-23 | maquina de desenvolvimento (Docker) | `financeiro-20260923-013132.dump` (652 KB) | **APROVADO** — 50 tabelas, 5.747 linhas, contagens iguais em todas | Gate 9 | Primeiro teste do projeto. Dados vindos da propria aplicacao (empresa, fornecedor, plano de contas, conta bancaria, titulo parcelado em 3x com a 1a parcela liquidada e a movimentacao bancaria correspondente). Conferencia por amostra alem das contagens: o titulo, as tres parcelas com suas situacoes e o pagamento voltaram integros. |

## Pendente

- [ ] Repetir **no VPS**, com os dados reais da Nova Didata, antes de o cliente
      receber acesso. Um teste na maquina de desenvolvimento prova os scripts;
      nao prova o servidor, o volume nem o destino remoto.
- [ ] Testar a restauracao a partir da **copia remota** (baixar do destino
      rclone e restaurar), nao so do arquivo local. E a copia remota que
      responde pelo caso de o VPS sumir.
- [ ] Testar a restauracao de um backup **cifrado com GPG**, com a chave
      privada guardada fora do servidor.
