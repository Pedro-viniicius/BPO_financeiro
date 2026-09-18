#!/bin/sh
# ============================================================================
# Backup do banco de dados (pg_dump em formato personalizado, comprimido).
#
# Variaveis:
#   PGHOST (padrao: banco)  PGUSER (padrao: financeiro_backup)  PGPASSWORD
#   PGDATABASE (padrao: financeiro)  BACKUP_DIRETORIO (padrao: /backups)
#   BACKUP_RETENCAO_DIAS (padrao: 30)
#
# Um backup que nunca foi restaurado nao e um backup. Teste a restauracao
# regularmente com scripts/restaurar.sh (ver docs/arquitetura/modelos-deploy.md).
# ============================================================================
set -eu

PGHOST="${PGHOST:-banco}"
PGUSER="${PGUSER:-financeiro_backup}"
PGDATABASE="${PGDATABASE:-financeiro}"
DIRETORIO="${BACKUP_DIRETORIO:-/backups}"
RETENCAO="${BACKUP_RETENCAO_DIAS:-30}"
export PGHOST PGUSER PGDATABASE

mkdir -p "$DIRETORIO"
ARQUIVO="$DIRETORIO/financeiro-$(date +%Y%m%d-%H%M%S).dump"

echo "[backup] iniciando: $ARQUIVO"
pg_dump --format=custom --compress=6 --file="$ARQUIVO.parcial"
mv "$ARQUIVO.parcial" "$ARQUIVO"
sha256sum "$ARQUIVO" > "$ARQUIVO.sha256"
echo "[backup] concluido: $(du -h "$ARQUIVO" | cut -f1)"

# Criptografia opcional: se BACKUP_CHAVE_PUBLICA_GPG estiver definida, cifra o arquivo.
if [ -n "${BACKUP_CHAVE_PUBLICA_GPG:-}" ] && command -v gpg >/dev/null 2>&1; then
  gpg --batch --yes --trust-model always -r "$BACKUP_CHAVE_PUBLICA_GPG" -o "$ARQUIVO.gpg" -e "$ARQUIVO" && rm -f "$ARQUIVO"
  echo "[backup] cifrado com GPG"
fi

echo "[backup] removendo backups com mais de $RETENCAO dias"
find "$DIRETORIO" -name "financeiro-*.dump*" -mtime +"$RETENCAO" -delete
find "$DIRETORIO" -name "financeiro-*.sha256" -mtime +"$RETENCAO" -delete
