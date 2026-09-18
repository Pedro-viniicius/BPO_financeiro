-- ============================================================================
-- Usuarios (roles) do PostgreSQL com menor privilegio.
-- Executado uma vez na criacao do banco (docker-entrypoint) ou manualmente
-- pelo administrador. Ver docs/arquitetura/banco-dados.md, secao "Usuarios".
--
-- Senhas: substitua os valores abaixo ANTES de executar em producao, ou
-- altere depois com: ALTER ROLE financeiro_aplicacao PASSWORD '...';
-- ============================================================================

-- Aplicacao: le e escreve dados; nao altera estrutura; nao apaga auditoria.
CREATE ROLE financeiro_aplicacao LOGIN PASSWORD 'troque-esta-senha';

-- Migracao: altera estrutura (CREATE/ALTER TABLE). Usado so por `pnpm banco:migrar`.
CREATE ROLE financeiro_migracao LOGIN PASSWORD 'troque-esta-senha';

-- Backup: somente leitura de tudo. Usado pelo pg_dump.
CREATE ROLE financeiro_backup LOGIN PASSWORD 'troque-esta-senha';

GRANT CONNECT ON DATABASE financeiro TO financeiro_aplicacao, financeiro_migracao, financeiro_backup;

-- A migracao e dona da estrutura: pode criar esquemas e tabelas.
-- (CREATE no banco e necessario porque o migrador do Drizzle executa
-- "CREATE SCHEMA IF NOT EXISTS" antes de aplicar as migracoes.)
GRANT CREATE ON DATABASE financeiro TO financeiro_migracao;
GRANT ALL ON SCHEMA public TO financeiro_migracao;
GRANT USAGE ON SCHEMA public TO financeiro_aplicacao, financeiro_backup;

-- Tabelas criadas pela migracao no futuro recebem automaticamente estas permissoes:
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financeiro_aplicacao;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migracao IN SCHEMA public
  GRANT SELECT ON TABLES TO financeiro_backup;

-- A protecao da auditoria (revogar UPDATE/DELETE de eventos_auditoria para a
-- aplicacao) e feita na migracao que cria a tabela, pois a tabela ainda nao
-- existe neste momento. Ver src/banco-dados/migracoes/.
