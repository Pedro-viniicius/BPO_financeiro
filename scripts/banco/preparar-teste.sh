#!/bin/sh
# ============================================================================
# Cria (se faltar) o banco de TESTES e aplica as migracoes nele.
#
# Os testes de integracao escrevem de verdade: criam empresas, gravam
# lancamentos e apagam tudo ao fim. Se apontarem para o banco de
# desenvolvimento, o cadastro de quem esta trabalhando some no meio do dia e
# sobra de teste vira dado "real". Por isso o banco e proprio e descartavel.
#
# Variaveis (com os padroes do docker-compose local):
#   BANCO_ADMIN_URL   conexao de superusuario, para CREATE DATABASE
#   BANCO_TESTE_NOME  nome do banco de testes (padrao: financeiro_teste)
#
# Uso: pnpm banco:preparar-teste
# ============================================================================
set -eu

# Le o .env sem executa-lo: so linhas CHAVE=VALOR, ignorando comentarios.
if [ -f .env ]; then
  while IFS= read -r linha; do
    case "$linha" in
      \#*|"") continue ;;
      *=*)
        chave=${linha%%=*}
        valor=${linha#*=}
        valor=$(printf '%s' "$valor" | sed 's/^["'"'"']//; s/["'"'"']$//')
        case "$chave" in
          BANCO_URL_TESTE|BANCO_URL_MIGRACAO|BANCO_SENHA_ADMIN|BANCO_ADMIN_URL|BANCO_TESTE_NOME)
            eval "$chave=\$valor"; export "$chave"
            ;;
        esac
        ;;
    esac
  done < .env
fi

NOME="${BANCO_TESTE_NOME:-financeiro_teste}"
if [ -z "${BANCO_ADMIN_URL:-}" ]; then
  if [ -n "${BANCO_SENHA_ADMIN:-}" ]; then
    BANCO_ADMIN_URL="postgres://financeiro_admin:$BANCO_SENHA_ADMIN@localhost:5432/postgres"
  else
    BANCO_ADMIN_URL="postgres://financeiro_admin@localhost:5432/postgres"
  fi
fi
ADMIN="$BANCO_ADMIN_URL"

# Em um VPS o `psql` esta no PATH. Numa maquina de desenvolvimento onde o
# PostgreSQL vive em contêiner, ele nao esta — entao aceita-se um comando
# alternativo, ex.: BANCO_PSQL="docker exec -i financeiro-pg psql".
PSQL="${BANCO_PSQL:-psql}"
if ! command -v ${PSQL%% *} > /dev/null 2>&1; then
  if command -v docker > /dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx financeiro-pg; then
    PSQL="docker exec -i financeiro-pg psql"
    echo "psql nao encontrado; usando o contêiner financeiro-pg."
  else
    echo "ERRO: psql nao encontrado. Instale o cliente do PostgreSQL ou defina" >&2
    echo "      BANCO_PSQL, ex.: BANCO_PSQL=\"docker exec -i financeiro-pg psql\"" >&2
    exit 1
  fi
fi

if [ -z "${BANCO_URL_TESTE:-}" ]; then
  echo "ERRO: defina BANCO_URL_TESTE no .env apontando para o banco de testes." >&2
  echo "      Exemplo: postgres://financeiro_aplicacao:SENHA@localhost:5432/$NOME" >&2
  exit 1
fi

case "$BANCO_URL_TESTE" in
  */"$NOME") : ;;
  *)
    echo "ERRO: BANCO_URL_TESTE nao aponta para /$NOME." >&2
    echo "      Recusando para nao aplicar migracoes de teste no banco errado." >&2
    exit 1
    ;;
esac

existe=$($PSQL "$ADMIN" -tAc "SELECT 1 FROM pg_database WHERE datname = '$NOME'")
if [ "$existe" != "1" ]; then
  echo "Criando o banco $NOME..."
  $PSQL "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $NOME OWNER financeiro_migracao"

  # Trocar o banco na propria URL, e nao com `-d`: o psql aplica o ultimo `-d`
  # por cima da URL e perde host, usuario e senha, caindo no socket local.
  ADMIN_NO_TESTE=$(printf '%s' "$ADMIN" | sed "s|/[^/?]*\(?.*\)\{0,1\}$|/$NOME|")
  $PSQL "$ADMIN_NO_TESTE" -v ON_ERROR_STOP=1 <<SQL
GRANT CONNECT ON DATABASE $NOME TO financeiro_aplicacao, financeiro_migracao, financeiro_backup;
GRANT CREATE ON DATABASE $NOME TO financeiro_migracao;
GRANT ALL ON SCHEMA public TO financeiro_migracao;
GRANT USAGE ON SCHEMA public TO financeiro_aplicacao, financeiro_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT ON TABLES TO financeiro_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO financeiro_backup;
SQL
else
  echo "Banco $NOME ja existe."
fi

# As migracoes vao pelo usuario de MIGRACAO, no banco de testes.
# Com BANCO_URL_MIGRACAO definida, troca-se so o nome do banco na URL dela: a
# senha da migracao e propria, nao a da aplicacao. Sem ela, cai no atalho
# antigo (mesma senha para os dois), que so vale em maquina de desenvolvimento.
if [ -n "${BANCO_URL_MIGRACAO:-}" ]; then
  URL_MIGRACAO_TESTE=$(printf '%s' "$BANCO_URL_MIGRACAO" | sed "s|/[^/?]*\(?.*\)\{0,1\}$|/$NOME|")
else
  senha_e_host=$(printf '%s' "$BANCO_URL_TESTE" | sed 's|^postgres://[^:]*:||')
  URL_MIGRACAO_TESTE="postgres://financeiro_migracao:$senha_e_host"
fi
BANCO_URL_MIGRACAO="$URL_MIGRACAO_TESTE" pnpm exec tsx src/banco-dados/migrar.ts

echo "Banco de testes pronto: $NOME"
