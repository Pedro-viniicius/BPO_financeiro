#!/bin/sh
# ============================================================================
# Backup do banco de dados (pg_dump em formato personalizado, comprimido).
#
# Variaveis:
#   PGHOST (padrao: banco)  PGUSER (padrao: financeiro_backup)  PGPASSWORD
#   PGDATABASE (padrao: financeiro)  BACKUP_DIRETORIO (padrao: /backups)
#   BACKUP_RETENCAO_DIAS (padrao: 30)
#   BACKUP_CHAVE_PUBLICA_GPG  destinatario GPG; cifra antes de sair do servidor
#   BACKUP_REMOTO_DESTINO     destino rclone, ex.: "b2:nova-didata/financeiro"
#   BACKUP_REMOTO_RETENCAO_DIAS (padrao: igual a BACKUP_RETENCAO_DIAS)
#
# BACKUP QUE MORA SO NO PROPRIO SERVIDOR NAO E BACKUP. Ele protege contra
# "apaguei sem querer", que e o caso comum, mas nao contra o caso que encerra
# a empresa: o servidor sumir. Por isso a copia remota faz parte deste script,
# e a falha dela e ERRO, nao aviso — um backup remoto que silenciosamente
# parou de sair e pior do que nenhum, porque da confianca.
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

# O arquivo pode ter virado .gpg acima; a copia remota leva o que existir.
ATUAL="$ARQUIVO"
[ -f "$ARQUIVO.gpg" ] && ATUAL="$ARQUIVO.gpg"

# ---------------------------------------------------------------- copia remota
if [ -n "${BACKUP_REMOTO_DESTINO:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "[backup] ERRO: BACKUP_REMOTO_DESTINO definido mas rclone nao esta instalado." >&2
    exit 1
  fi
  echo "[backup] enviando para $BACKUP_REMOTO_DESTINO"
  rclone copy "$ATUAL" "$BACKUP_REMOTO_DESTINO/" --no-traverse
  [ -f "$ARQUIVO.sha256" ] && rclone copy "$ARQUIVO.sha256" "$BACKUP_REMOTO_DESTINO/" --no-traverse

  # Conferir que chegou: comparar o tamanho do que esta la com o daqui.
  nome=$(basename "$ATUAL")
  tamanho_local=$(wc -c < "$ATUAL" | tr -d ' ')
  tamanho_remoto=$(rclone size "$BACKUP_REMOTO_DESTINO/$nome" --json 2>/dev/null | sed 's/.*"bytes":\([0-9]*\).*/\1/' || echo "")
  if [ "$tamanho_local" != "$tamanho_remoto" ]; then
    echo "[backup] ERRO: copia remota nao confere (local $tamanho_local, remoto ${tamanho_remoto:-ausente})." >&2
    exit 1
  fi
  echo "[backup] copia remota conferida ($tamanho_local bytes)"

  RETENCAO_REMOTA="${BACKUP_REMOTO_RETENCAO_DIAS:-$RETENCAO}"
  rclone delete "$BACKUP_REMOTO_DESTINO" --min-age "${RETENCAO_REMOTA}d" --include "financeiro-*" || true
else
  echo "[backup] AVISO: sem BACKUP_REMOTO_DESTINO — a copia vive so neste servidor." >&2
fi

echo "[backup] removendo backups locais com mais de $RETENCAO dias"
find "$DIRETORIO" -name "financeiro-*.dump*" -mtime +"$RETENCAO" -delete
find "$DIRETORIO" -name "financeiro-*.sha256" -mtime +"$RETENCAO" -delete
