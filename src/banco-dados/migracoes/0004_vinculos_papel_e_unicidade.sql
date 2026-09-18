CREATE TYPE "public"."papel_vinculo" AS ENUM('administrador', 'financeiro', 'tesouraria', 'controladoria', 'auditor', 'somente_leitura');--> statement-breakpoint
DROP INDEX "vinculos_usuario_unico_idx";--> statement-breakpoint
ALTER TABLE "vinculos_usuario" ALTER COLUMN "papel" SET DATA TYPE "public"."papel_vinculo" USING "papel"::"public"."papel_vinculo";--> statement-breakpoint
ALTER TABLE "vinculos_usuario" ADD CONSTRAINT "unico_vinculos_usuario_escopo" UNIQUE NULLS NOT DISTINCT("usuario_id","organizacao_id","empresa_id");