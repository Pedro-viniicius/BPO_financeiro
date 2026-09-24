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
#   ARQUIVOS_DIRETORIO (padrao: /arquivos)  o volume de anexos, montado so-leitura
#
# ARQUIVOS (Gate 10, ADR-027): um backup que salva o lancamento e perde a nota
# fiscal nao serve para nada. Os anexos vao para o remoto ANTES do dump do
# banco, de proposito: a chave de cada arquivo nunca muda, entao a pior
# consequencia da janela entre os dois e um arquivo sem linha (lixo
# inofensivo). Na ordem inversa, seria uma linha apontando para arquivo que
# o backup nao tem. A copia e incremental de graca (`rclone copy` so envia o
# que falta) e NUNCA apaga pelo remoto: a retencao alcanca a copia remota por
# uma LISTA EXPLICITA de chaves que o sistema expurgou (`arquivos.removido_em`),
# porque apagar por idade destruiria arquivo antigo que ainda esta vigente.
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

ARQUIVOS_DIRETORIO="${ARQUIVOS_DIRETORIO:-/arquivos}"

mkdir -p "$DIRETORIO"
ARQUIVO="$DIRETORIO/financeiro-$(date +%Y%m%d-%H%M%S).dump"

# ---- 1. Anexos: copia incremental para o remoto, antes do dump -------------
if [ -n "${BACKUP_REMOTO_DESTINO:-}" ] && [ -d "$ARQUIVOS_DIRETORIO" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "[backup] ERRO: BACKUP_REMOTO_DESTINO definido mas rclone nao esta instalado." >&2
    exit 1
  fi
  echo "[backup] anexos: enviando o que falta para $BACKUP_REMOTO_DESTINO/arquivos"
  rclone copy "$ARQUIVOS_DIRETORIO" "$BACKUP_REMOTO_DESTINO/arquivos" --exclude "*.parcial"

  # Retencao na copia remota: SO as chaves que o sistema expurgou. A lista vem
  # do banco (usuario de backup so le), limitada aos ultimos dias para nao
  # varrer a tabela inteira todo dia. Um arquivo que sumiu do disco por outro
  # motivo NAO e apagado do remoto — e justamente o caso em que o remoto salva.
  JANELA_EXPURGO_DIAS="${BACKUP_JANELA_EXPURGO_DIAS:-7}"
  EXPURGADOS="$DIRETORIO/.expurgados-$$.txt"
  psql -tA -c "SELECT chave_armazenamento FROM arquivos WHERE removido_em IS NOT NULL AND removido_em > now() - interval '${JANELA_EXPURGO_DIAS} days'" > "$EXPURGADOS"
  if [ -s "$EXPURGADOS" ]; then
    rclone delete "$BACKUP_REMOTO_DESTINO/arquivos" --files-from "$EXPURGADOS"
    echo "[backup] anexos: $(grep -c . "$EXPURGADOS") chave(s) expurgada(s) removida(s) do remoto"
  fi
  rm -f "$EXPURGADOS"

  # Conferencia: todo arquivo VIVO no banco precisa existir no remoto. Contar
  # nao basta (orfaos inflam o numero); conferimos chave a chave.
  VIVOS="$DIRETORIO/.vivos-$$.txt"
  psql -tA -c "SELECT chave_armazenamento FROM arquivos WHERE removido_em IS NULL" > "$VIVOS"
  rclone lsf "$BACKUP_REMOTO_DESTINO/arquivos" --recursive --files-only | sort > "$VIVOS.remoto"
  FALTANDO=$(sort "$VIVOS" | comm -23 - "$VIVOS.remoto" | grep -c . || true)
  if [ "$FALTANDO" != "0" ]; then
    echo "[backup] ERRO: $FALTANDO arquivo(s) vivo(s) no banco nao esta(ao) no remoto." >&2
    rm -f "$VIVOS" "$VIVOS.remoto"
    exit 1
  fi
  echo "[backup] anexos: $(grep -c . "$VIVOS" || true) arquivo(s) vivo(s) conferido(s) no remoto"
  rm -f "$VIVOS" "$VIVOS.remoto"
elif [ -d "$ARQUIVOS_DIRETORIO" ]; then
  echo "[backup] AVISO: anexos em $ARQUIVOS_DIRETORIO sem BACKUP_REMOTO_DESTINO — vivem so neste servidor." >&2
fi

# ---- 2. Banco ---------------------------------------------------------------

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
