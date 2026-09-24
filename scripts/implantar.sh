#!/bin/sh
# ============================================================================
# Implantacao em producao (VPS, Modelo A).
#
#   scripts/implantar.sh [versao]
#
# `versao` e a tag da imagem. Sem argumento, usa a data e o commit atual
# (ex.: 20260923-5466e9c), que e o que torna `reverter.sh` possivel: a versao
# anterior continua no disco, pronta para voltar.
#
# ORDEM, e o porque de cada passo:
#   1. conferir que ha .env e que o repositorio esta limpo;
#   2. BACKUP ANTES DE QUALQUER COISA. Uma migration ruim nao tem "desfazer";
#      o que existe e o backup de minutos atras;
#   3. construir a imagem nova com a tag da versao (a antiga fica no disco);
#   4. subir: o servico `migracao` roda e encerra ANTES da aplicacao;
#   5. conferir a saude pela porta interna;
#   6. se a saude falhar, VOLTAR sozinho para a versao anterior.
#
# Ver docs/operacao/implantacao-vps.md.
# ============================================================================
set -eu

COMPOSE="docker compose -f docker-compose.producao.yml"
ARQUIVO_VERSAO=".versao-em-producao"

if [ ! -f .env ]; then
  echo "ERRO: .env nao existe. Copie .env.producao.exemplo e preencha." >&2
  exit 1
fi
if [ "$(stat -c '%a' .env)" != "600" ]; then
  echo "AVISO: .env nao esta com permissao 600. Corrigindo." >&2
  chmod 600 .env
fi

# Senhas do banco: as quatro precisam existir, e nenhuma pode ser o valor de
# exemplo. O script de inicializacao do banco tambem recusa, mas ele so roda
# na criacao do volume — aqui a recusa vem antes de qualquer `up`.
if grep -q 'troque-esta-senha' .env; then
  echo "ERRO: o .env ainda contem 'troque-esta-senha'. Gere senhas reais: openssl rand -base64 24" >&2
  exit 1
fi
for variavel in BANCO_SENHA_ADMIN BANCO_SENHA_APLICACAO BANCO_SENHA_MIGRACAO BANCO_SENHA_BACKUP; do
  if ! grep -q "^$variavel=." .env; then
    echo "ERRO: $variavel esta ausente ou vazia no .env." >&2
    exit 1
  fi
done

# A pasta existe mesmo sem backup remoto configurado: o compose a monta.
mkdir -p segredos backups
chmod 700 segredos

VERSAO="${1:-$(date +%Y%m%d)-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}"
ANTERIOR=$([ -f "$ARQUIVO_VERSAO" ] && cat "$ARQUIVO_VERSAO" || echo "")
export VERSAO

echo "=============================================================="
echo " Implantando versao: $VERSAO"
[ -n "$ANTERIOR" ] && echo " Versao atual no ar:  $ANTERIOR"
echo "=============================================================="

# --- 1. backup antes de mexer ----------------------------------------------
if $COMPOSE ps --status running 2>/dev/null | grep -q banco; then
  echo "[1/5] backup antes da implantacao"
  $COMPOSE run --rm --no-deps -T backup /backup.sh
else
  echo "[1/5] banco ainda nao esta no ar (primeira implantacao): sem backup previo"
fi

# --- 2. imagem --------------------------------------------------------------
echo "[2/5] construindo a imagem financeiro:$VERSAO"
$COMPOSE build

# --- 3. subir ---------------------------------------------------------------
echo "[3/5] aplicando migracoes e subindo os servicos"
$COMPOSE up -d --remove-orphans

# --- 4. saude ---------------------------------------------------------------
echo "[4/5] conferindo a saude da aplicacao"
saudavel=""
for tentativa in 1 2 3 4 5 6 7 8 9 10; do
  if $COMPOSE exec -T aplicacao wget -qO- http://localhost:3000/api/saude 2>/dev/null | grep -q '"situacao":"ok"'; then
    saudavel="sim"
    break
  fi
  echo "    ainda subindo... ($tentativa/10)"
  sleep 5
done

if [ -z "$saudavel" ]; then
  echo "[!] A aplicacao nao respondeu saudavel." >&2
  $COMPOSE logs --tail 50 aplicacao migracao >&2
  if [ -n "$ANTERIOR" ]; then
    echo "[!] Voltando sozinho para $ANTERIOR." >&2
    scripts/reverter.sh "$ANTERIOR"
    exit 1
  fi
  echo "[!] Nao ha versao anterior para voltar. Servicos deixados de pe para diagnostico." >&2
  exit 1
fi

# --- 5. registrar -----------------------------------------------------------
echo "$VERSAO" > "$ARQUIVO_VERSAO"
[ -n "$ANTERIOR" ] && echo "$ANTERIOR" > ".versao-anterior"

echo "[5/5] no ar: $VERSAO"
echo
echo "Conferir: https://$(grep '^DOMINIO=' .env | cut -d= -f2)"
[ -n "$ANTERIOR" ] && echo "Reverter: scripts/reverter.sh $ANTERIOR"
exit 0
