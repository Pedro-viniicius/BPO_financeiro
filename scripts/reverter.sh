#!/bin/sh
# ============================================================================
# Volta a producao para uma versao anterior.
#
#   scripts/reverter.sh [versao]
#
# Sem argumento, usa a versao registrada em `.versao-anterior`.
#
# O QUE ESTE SCRIPT FAZ: troca a imagem de volta. Isso resolve o caso comum —
# codigo novo com defeito, banco inalterado.
#
# O QUE ELE NAO FAZ: desfazer migration. Se a versao nova alterou o banco, a
# imagem antiga pode nao entender o esquema novo. Nesse caso o caminho e
# restaurar o backup tirado por `implantar.sh` minutos antes:
#
#   docker compose -f docker-compose.producao.yml stop aplicacao tarefas
#   docker compose -f docker-compose.producao.yml run --rm -T backup \
#     sh -c 'PGUSER=financeiro_admin /restaurar.sh /backups/ARQUIVO.dump financeiro'
#
# Por isso o script AVISA quando o banco mudou entre as duas versoes, em vez
# de fingir que trocar a tag basta.
# ============================================================================
set -eu

COMPOSE="docker compose -f docker-compose.producao.yml"
ARQUIVO_VERSAO=".versao-em-producao"

ALVO="${1:-$([ -f .versao-anterior ] && cat .versao-anterior || echo '')}"
if [ -z "$ALVO" ]; then
  echo "ERRO: informe a versao, ou tenha .versao-anterior. Disponiveis:" >&2
  docker images financeiro --format '  {{.Tag}}  ({{.CreatedSince}})' >&2
  exit 1
fi

if ! docker image inspect "financeiro:$ALVO" > /dev/null 2>&1; then
  echo "ERRO: a imagem financeiro:$ALVO nao existe neste servidor. Disponiveis:" >&2
  docker images financeiro --format '  {{.Tag}}  ({{.CreatedSince}})' >&2
  exit 1
fi

ATUAL=$([ -f "$ARQUIVO_VERSAO" ] && cat "$ARQUIVO_VERSAO" || echo "desconhecida")
echo "Revertendo: $ATUAL  ->  $ALVO"

# Migrations aplicadas agora, para comparar com o que a imagem antiga espera.
aplicadas=$($COMPOSE exec -T banco psql -U financeiro_admin -d financeiro -tAc \
  "SELECT count(*) FROM migracoes_aplicadas" 2>/dev/null || echo "?")
esperadas=$(docker run --rm --entrypoint sh "financeiro:$ALVO" -c \
  'ls src/banco-dados/migracoes/*.sql | wc -l' 2>/dev/null || echo "?")

if [ "$aplicadas" != "?" ] && [ "$esperadas" != "?" ] && [ "$aplicadas" -gt "$esperadas" ] 2>/dev/null; then
  echo
  echo "ATENCAO: o banco tem $aplicadas migracoes e a versao $ALVO conhece $esperadas."
  echo "Trocar so a imagem deixa a aplicacao antiga diante de um esquema mais novo."
  echo "O caminho seguro e restaurar o backup tirado antes da implantacao."
  echo "Continuar mesmo assim? Digite exatamente 'REVERTER SOMENTE A IMAGEM':"
  read -r confirmacao
  [ "$confirmacao" = "REVERTER SOMENTE A IMAGEM" ] || { echo "cancelado"; exit 1; }
fi

VERSAO="$ALVO"
export VERSAO

# `--no-deps` para nao reexecutar o servico de migracao: ele so avanca, nunca volta.
$COMPOSE up -d --no-deps aplicacao tarefas proxy

for tentativa in 1 2 3 4 5 6 7 8 9 10; do
  if $COMPOSE exec -T aplicacao wget -qO- http://localhost:3000/api/saude 2>/dev/null | grep -q '"situacao":"ok"'; then
    echo "$ALVO" > "$ARQUIVO_VERSAO"
    echo "Revertido para $ALVO."
    exit 0
  fi
  echo "    aguardando... ($tentativa/10)"
  sleep 5
done

echo "ERRO: a versao $ALVO tambem nao respondeu saudavel." >&2
$COMPOSE logs --tail 50 aplicacao >&2
exit 1
