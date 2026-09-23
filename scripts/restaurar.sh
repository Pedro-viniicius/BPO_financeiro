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

# --------------------------------------------------------------- conferencia
# Contar DUAS tabelas nao prova restauracao: um dump truncado no meio pode
# trazer `empresas` inteira e perder os lancamentos. Aqui se conta TODAS as
# tabelas e, quando a origem esta acessivel, compara-se uma a uma.
#
# Contagem EXATA, nao `n_live_tup`: aquela coluna e uma estimativa do
# planejador e fica desatualizada — um backup aprovado por estimativa nao
# prova nada. `query_to_xml` roda um count(*) de verdade por tabela, em uma
# consulta so.
echo "[restaurar] contando as linhas de todas as tabelas"

CONSULTA_CONTAGENS="
  SELECT relname || ':' || (xpath('/row/c/text()', contagem))[1]::text::bigint
  FROM (
    SELECT relname,
           query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname), false, true, '') AS contagem
    FROM pg_stat_user_tables WHERE schemaname = 'public'
  ) t ORDER BY relname"

TEMP="${TMPDIR:-/tmp}/restaurar-$$"
mkdir -p "$TEMP"
trap 'rm -rf "$TEMP"' EXIT

psql -d "$BANCO_DESTINO" -tAc "$CONSULTA_CONTAGENS" > "$TEMP/destino.txt"
TABELAS=$(grep -c . "$TEMP/destino.txt" || true)
TOTAL=$(awk -F: '{s+=$2} END {print s+0}' "$TEMP/destino.txt")
echo "[restaurar] $TABELAS tabelas, $TOTAL linhas em $BANCO_DESTINO"

ORIGEM="${BANCO_ORIGEM:-financeiro}"
if [ "$ORIGEM" != "$BANCO_DESTINO" ] && psql -d "$ORIGEM" -c "SELECT 1" > /dev/null 2>&1; then
  echo "[restaurar] comparando com a origem ($ORIGEM)"
  psql -d "$ORIGEM" -tAc "$CONSULTA_CONTAGENS" > "$TEMP/origem.txt"
  if ! diff "$TEMP/origem.txt" "$TEMP/destino.txt" > "$TEMP/diferencas.txt"; then
    echo "[restaurar] FALHOU: as contagens nao batem (< origem, > restaurado)." >&2
    cat "$TEMP/diferencas.txt" >&2
    exit 1
  fi
  echo "[restaurar] contagens IGUAIS nas $TABELAS tabelas."
else
  echo "[restaurar] origem indisponivel para comparar; conferido so o total."
fi

echo "[restaurar] concluido. Registre a data e o resultado em docs/operacao/registro-restauracoes.md"
