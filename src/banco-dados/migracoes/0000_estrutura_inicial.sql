CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" text,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "filiais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculos_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"empresa_id" uuid,
	"papel" text NOT NULL,
	"permissoes_extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permissoes_removidas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" text,
	"organizacao_id" uuid,
	"empresa_id" uuid,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"dados_antes" jsonb,
	"dados_depois" jsonb,
	"origem" text NOT NULL,
	"ip" text,
	"agente_usuario" text,
	"requisicao_id" text
);
--> statement-breakpoint
CREATE TABLE "eventos_saida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"organizacao_id" uuid,
	"empresa_id" uuid,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" text,
	"dados" jsonb NOT NULL,
	"publicado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text
);
--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"dados" jsonb NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"agendada_para" timestamp with time zone DEFAULT now() NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"maximo_tentativas" integer DEFAULT 5 NOT NULL,
	"ultimo_erro" text,
	"chave_idempotencia" text,
	"organizacao_id" uuid,
	"empresa_id" uuid,
	"usuario_id" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_usuario" ADD CONSTRAINT "vinculos_usuario_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_usuario" ADD CONSTRAINT "vinculos_usuario_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_usuario" ADD CONSTRAINT "vinculos_usuario_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "empresas_organizacao_idx" ON "empresas" USING btree ("organizacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_cnpj_unico_idx" ON "empresas" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "filiais_empresa_idx" ON "filiais" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "vinculos_usuario_usuario_idx" ON "vinculos_usuario" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "vinculos_usuario_empresa_idx" ON "vinculos_usuario" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_usuario_unico_idx" ON "vinculos_usuario" USING btree ("usuario_id","organizacao_id","empresa_id");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_empresa_data_idx" ON "eventos_auditoria" USING btree ("empresa_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_entidade_idx" ON "eventos_auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_usuario_idx" ON "eventos_auditoria" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "eventos_saida_pendentes_idx" ON "eventos_saida" USING btree ("publicado_em","ocorrido_em");--> statement-breakpoint
CREATE INDEX "tarefas_pendentes_idx" ON "tarefas" USING btree ("estado","agendada_para");--> statement-breakpoint
CREATE UNIQUE INDEX "tarefas_chave_idempotencia_idx" ON "tarefas" USING btree ("chave_idempotencia");