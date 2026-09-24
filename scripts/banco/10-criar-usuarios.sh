#!/bin/sh
# ============================================================================
# Usuarios (roles) do PostgreSQL com menor privilegio.
#
# As SENHAS VEM DO AMBIENTE — nunca deste arquivo:
#   BANCO_SENHA_APLICACAO   usuario da aplicacao (le e escreve dados; sem DDL)
#   BANCO_SENHA_MIGRACAO    usuario de migracao (altera estrutura)
#   BANCO_SENHA_BACKUP      usuario de backup (somente leitura)
#
# Este arquivo e versionado. A versao anterior pedia para EDITA-LO com as
# senhas reais antes do primeiro `up` — e um arquivo rastreado pelo git com
# senha real dentro esta a um `git add` de virar historico. Se ninguem
# editasse, o banco nascia com a senha padrao publica. Agora o script se
# recusa a rodar sem as tres variaveis, ou com o valor de exemplo.
#
# Onde roda:
#   (a) no initdb do container (montado em /docker-entrypoint-initdb.d), uma
#       unica vez, na criacao do volume: usa POSTGRES_USER/POSTGRES_DB;
#   (b) a mao ou na CI, contra um servidor ja de pe:
#       BANCO_URL_ADMIN=postgres://admin:senha@host:5432/financeiro sh scripts/banco/10-criar-usuarios.sh
#
# Ver docs/arquitetura/banco-dados.md, secao "Usuarios".
# ============================================================================
set -eu

for variavel in BANCO_SENHA_APLICACAO BANCO_SENHA_MIGRACAO BANCO_SENHA_BACKUP; do
  eval "valor=\${$variavel:-}"
  if [ -z "$valor" ] || [ "$valor" = "troque-esta-senha" ]; then
    echo "ERRO: defina $variavel no ambiente (.env) antes de criar o banco. Gere com: openssl rand -base64 24" >&2
    exit 1
  fi
done

BANCO="${POSTGRES_DB:-financeiro}"
if [ -n "${BANCO_URL_ADMIN:-}" ]; then
  CONEXAO="$BANCO_URL_ADMIN"
else
  CONEXAO="--username=${POSTGRES_USER:-postgres} --dbname=$BANCO"
fi

# Sem aspas em $CONEXAO de proposito: no initdb sao DOIS argumentos.
# As senhas entram como VARIAVEIS do psql (:'nome'), que as cita corretamente
# — nunca por interpolacao de texto no SQL.
psql -v ON_ERROR_STOP=1 $CONEXAO \
  -v banco="$BANCO" \
  -v senha_aplicacao="$BANCO_SENHA_APLICACAO" \
  -v senha_migracao="$BANCO_SENHA_MIGRACAO" \
  -v senha_backup="$BANCO_SENHA_BACKUP" <<'SQL'
-- Aplicacao: le e escreve dados; nao altera estrutura; nao apaga auditoria.
CREATE ROLE financeiro_aplicacao LOGIN PASSWORD :'senha_aplicacao';

-- Migracao: altera estrutura (CREATE/ALTER TABLE). Usado so por `pnpm banco:migrar`.
CREATE ROLE financeiro_migracao LOGIN PASSWORD :'senha_migracao';

-- Backup: somente leitura de tudo. Usado pelo pg_dump.
CREATE ROLE financeiro_backup LOGIN PASSWORD :'senha_backup';

GRANT CONNECT ON DATABASE :"banco" TO financeiro_aplicacao, financeiro_migracao, financeiro_backup;

-- A migracao e dona da estrutura: pode criar esquemas e tabelas.
-- (CREATE no banco e necessario porque o migrador do Drizzle executa
-- "CREATE SCHEMA IF NOT EXISTS" antes de aplicar as migracoes.)
GRANT CREATE ON DATABASE :"banco" TO financeiro_migracao;
GRANT ALL ON SCHEMA public TO financeiro_migracao;
GRANT USAGE ON SCHEMA public TO financeiro_aplicacao, financeiro_backup;

-- Tabelas criadas pela migracao no futuro recebem automaticamente estas permissoes:
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT ON TABLES TO financeiro_backup;
-- pg_dump le tambem as SEQUENCIAS (ex.: migracoes_aplicadas_id_seq). Sem isto o
-- backup falha com "permission denied for sequence" — achado do ensaio do Gate 10.
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO financeiro_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO financeiro_backup;

-- A protecao da auditoria (revogar UPDATE/DELETE de eventos_auditoria para a
-- aplicacao) e feita na migracao que cria a tabela, pois a tabela ainda nao
-- existe neste momento. Ver src/banco-dados/migracoes/.
SQL

echo "Usuarios do banco criados: financeiro_aplicacao, financeiro_migracao, financeiro_backup."
