# ============================================================================
# Imagem do servico de backup.
#
# Precisa de tres coisas que nao vivem juntas em nenhuma imagem pronta:
#   pg_dump   da MESMA versao maior do servidor (17), senao o dump e recusado
#   rclone    para a copia fora do servidor
#   gpg       para cifrar antes de o arquivo sair daqui
#
# A base e a propria imagem do PostgreSQL para garantir o primeiro item: usar
# um pg_dump mais antigo que o servidor falha na hora, e mais novo gera dump
# que o servidor de destino pode nao ler.
# ============================================================================
FROM postgres:17-alpine

RUN apk add --no-cache rclone gnupg

# Contexto de build = raiz do repositorio, para copiar o UNICO backup.sh.
# Uma segunda copia dentro desta pasta divergiria da primeira no dia em que
# alguem corrigisse so uma delas.
COPY scripts/backup.sh /backup.sh
# O restaurador viaja junto: na hora em que ele e necessario, ninguem quer
# descobrir que precisa copiar um arquivo para dentro do contêiner.
COPY scripts/restaurar.sh /restaurar.sh
RUN chmod +x /backup.sh /restaurar.sh

# Um ciclo por dia. O `sleep` simples basta: perder uma janela por reinicio nao
# e problema, e cron dentro de contêiner acrescenta um processo a vigiar.
#
# CMD, e nao ENTRYPOINT, de proposito: com ENTRYPOINT, um
# `docker compose run backup /backup.sh` — que e como se tira um backup
# avulso antes de implantar — vira argumento do `sh -c` e cai no laco
# infinito, travando o deploy. Como CMD, o comando informado o SUBSTITUI, e
# um backup avulso roda uma vez e encerra.
CMD ["/bin/sh", "-c", "while true; do /backup.sh || echo '[backup] FALHOU — veja o log acima'; sleep 86400; done"]
