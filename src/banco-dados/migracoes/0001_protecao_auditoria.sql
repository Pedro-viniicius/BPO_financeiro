-- ============================================================================
-- Protecao da trilha de auditoria: somente insercao.
--
-- 1. Gatilho (trigger) que rejeita UPDATE e DELETE em eventos_auditoria.
--    Vale para qualquer usuario, inclusive o de migracao. Uma rotina de
--    retencao (LGPD) que precise apagar registros antigos deve desativar o
--    gatilho explicitamente em um procedimento documentado e auditado.
-- 2. Revogacao de UPDATE/DELETE para o usuario da aplicacao, se ele existir
--    (em desenvolvimento pode nao existir; em producao e criado por
--    scripts/banco/criar-usuarios.sql).
-- ============================================================================
CREATE OR REPLACE FUNCTION rejeitar_alteracao_auditoria() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria e somente insercao: % nao permitido em eventos_auditoria.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS auditoria_somente_insercao ON eventos_auditoria;
--> statement-breakpoint
CREATE TRIGGER auditoria_somente_insercao
  BEFORE UPDATE OR DELETE ON eventos_auditoria
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_auditoria();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'financeiro_aplicacao') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON eventos_auditoria FROM financeiro_aplicacao;
  END IF;
END
$$;
