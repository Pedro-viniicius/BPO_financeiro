-- ============================================================================
-- Convites de acesso (Gate 9, item 3).
--
-- Por que e necessaria: nao havia como acrescentar usuario pela interface. O
-- unico caminho era criar conta pela tela publica e ligar o vinculo por SQL.
--
-- Um convite e um LINK de uso unico com prazo, porque o sistema nunca cria
-- senha para ninguem: quem entra define a propria. Enviar senha por e-mail, ou
-- mostra-la na tela para alguem copiar, deixa a senha em caixa de entrada e em
-- historico de conversa para sempre.
--
-- GUARDA-SE O HASH DO TOKEN, nunca o token. Com o hash, um vazamento deste
-- banco nao da acesso a ninguem: quem tem o link continua sendo so quem o
-- recebeu. Mesma razao de nunca guardar senha em claro.
--
-- `aceito_em` e o que torna o convite de uso UNICO, e o CHECK garante que
-- aceite sem usuario (ou o contrario) nao existe.
-- ============================================================================

CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"empresa_id" uuid,
	"email" text NOT NULL,
	"papel" "papel_vinculo" NOT NULL,
	"token_hash" text NOT NULL,
	"convidado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" text,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "verifica_convites_aceite" CHECK ((aceito_em IS NULL) = (aceito_por IS NULL)),
	CONSTRAINT "verifica_convites_prazo" CHECK (expira_em > criado_em),
	CONSTRAINT "verifica_convites_email" CHECK (position('@' in email) > 1)
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_convidado_por_user_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_aceito_por_user_id_fk" FOREIGN KEY ("aceito_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_convites_token" ON "convites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "convites_organizacao_email_idx" ON "convites" USING btree ("organizacao_id","email");