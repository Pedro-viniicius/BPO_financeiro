#!/bin/sh
# ============================================================================
# Restauracao de um backup gerado por scripts/backup.sh.
#
# Uso:
#   scripts/restaurar.sh caminho/para/financeiro-AAAAMMDD-HHMMSS.dump [banco_destino]
#
# Por seguranca, o padrao restaura em um banco SEPARADO chamado
# `financeiro_restauracao`, para validar o backup sem tocar na producao.
# So restaure por cima do banco de producao em procedimento de recuperacao,
# com a aplicacao parada. Ver docs/arquitetura/modelos-deploy.md.
#
# Variaveis: PGHOST PGUSER (precisa poder criar banco) PGPASSWORD
# ============================================================================
set -eu

ARQUIVO="${1:?informe o arquivo de backup}"
BANCO_DESTINO="${2:-financeiro_restauracao}"
PGHOST="${PGHOST:-banco}"
PGUSER="${PGUSER:-financeiro_admin}"
export PGHOST PGUSER

if [ -f "$ARQUIVO.sha256" ]; then
  echo "[restaurar] conferindo integridade"
  (cd "$(dirname "$ARQUIVO")" && sha256sum -c "$(basename "$ARQUIVO").sha256")
fi

if [ "$BANCO_DESTINO" = "financeiro" ]; then
  echo "ATENCAO: voce esta prestes a SOBRESCREVER o banco de producao 'financeiro'."
  echo "Digite exatamente 'RESTAURAR PRODUCAO' para continuar:"
  read -r confirmacao
  [ "$confirmacao" = "RESTAURAR PRODUCAO" ] || { echo "cancelado"; exit 1; }
fi

echo "[restaurar] criando banco $BANCO_DESTINO (se nao existir)"
psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$BANCO_DESTINO'" | grep -q 1 \
  || psql -d postgres -c "CREATE DATABASE \"$BANCO_DESTINO\""

echo "[restaurar] restaurando $ARQUIVO em $BANCO_DESTINO"
pg_restore --dbname="$BANCO_DESTINO" --clean --if-exists --no-owner --no-privileges "$ARQUIVO"

echo "[restaurar] verificacao basica"
psql -d "$BANCO_DESTINO" -c "SELECT count(*) AS empresas FROM empresas;" \
  && psql -d "$BANCO_DESTINO" -c "SELECT count(*) AS eventos_auditoria FROM eventos_auditoria;"

echo "[restaurar] concluido. Registre a data e o resultado deste teste em docs/operacao/registro-restauracoes.md"
