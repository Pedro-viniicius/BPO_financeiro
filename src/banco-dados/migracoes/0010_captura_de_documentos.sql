-- ============================================================================
-- Captura de documentos por QR code (Gate 10, fatia 1).
--
-- Por que e necessaria: hoje o cliente manda nota, recibo e boleto por e-mail
-- e WhatsApp — atraso, retrabalho e nenhuma trilha. Cada empresa passa a ter
-- um QR code proprio; quem o escaneia abre uma pagina publica, fotografa o
-- documento, e o envio entra numa FILA DE CONFERENCIA ja vinculado a empresa.
--
-- Documento recebido NAO e conta a pagar. `documentos_capturados` e tabela
-- propria, com situacao propria; a conta so nasce quando a equipe confere e
-- aprova. Misturar as duas poria documento nao conferido dentro de
-- `titulos_pagar`, que tem aprovacao, baixa, estorno e cancelamento proprios.
--
-- `tokens_captura` GUARDA SO O HASH do token, como `convites`: um vazamento
-- deste banco nao da a ninguem o direito de enviar em nome de uma empresa.
-- Um token ativo por empresa (indice unico parcial); regerar revoga o
-- anterior, e o revogado fica registrado, nao apagado.
--
-- `chave_acesso` e TEXTO: desde a NT 2025.001 o CNPJ na chave pode ser
-- alfanumerico. Nao e unica de proposito — a duplicidade e aviso para a
-- equipe na fila, nunca recusa na pagina publica, que nao pode revelar o que
-- ja entrou. `titulo_pagar_id` usa SET NULL porque `contas_pagar.excluir`
-- apaga o titulo e este modulo nao muda o comportamento daquele; o vinculo
-- sobrevive na trilha de auditoria (`documento.conferido`).
--
-- `tentativas_captura` nao tem `empresa_id`, e isso e excecao consciente ao
-- padrao: um pedido recusado na porta (token invalido) nao tem empresa, e
-- atribuir uma exigiria confiar no token que acabou de ser recusado. E
-- controle tecnico, como `tarefas`. O identificador e hash — nunca IP em claro.
--
-- A chave estrangeira de `anexos_documentos_capturados` tem nome dado a mao:
-- o nome automatico teria 69 caracteres e o PostgreSQL trunca em 63, em
-- silencio.
--
-- Nenhuma tabela existente e alterada.
-- ============================================================================

CREATE TYPE "public"."situacao_documento_capturado" AS ENUM('pendente_conferencia', 'aprovado', 'rejeitado', 'arquivado_sem_conferencia');--> statement-breakpoint
CREATE TABLE "anexos_documentos_capturados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_anexos_documentos_capturados_ordem" CHECK (ordem >= 0)
);
--> statement-breakpoint
CREATE TABLE "documentos_capturados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"situacao" "situacao_documento_capturado" DEFAULT 'pendente_conferencia' NOT NULL,
	"observacao" text,
	"chave_acesso" text,
	"data_competencia" date,
	"data_marco_retencao" date,
	"titulo_pagar_id" uuid,
	"entrou_na_fila_em" timestamp with time zone DEFAULT now() NOT NULL,
	"conferido_em" timestamp with time zone,
	"conferido_por" text,
	"motivo_rejeicao" text,
	"arquivado_em" timestamp with time zone,
	"reaberto_em" timestamp with time zone,
	"reaberto_por" text,
	"expurgado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_documentos_capturados_chave" CHECK (chave_acesso IS NULL OR chave_acesso ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'),
	CONSTRAINT "verifica_documentos_capturados_conferencia" CHECK ((conferido_em IS NULL) = (conferido_por IS NULL)),
	CONSTRAINT "verifica_documentos_capturados_reabertura" CHECK ((reaberto_em IS NULL) = (reaberto_por IS NULL)),
	CONSTRAINT "verifica_documentos_capturados_rejeicao" CHECK (situacao <> 'rejeitado' OR motivo_rejeicao IS NOT NULL),
	CONSTRAINT "verifica_documentos_capturados_decisao" CHECK (situacao NOT IN ('aprovado', 'rejeitado') OR conferido_em IS NOT NULL),
	CONSTRAINT "verifica_documentos_capturados_arquivamento" CHECK (situacao <> 'arquivado_sem_conferencia' OR arquivado_em IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tentativas_captura" (
	"identificador" text NOT NULL,
	"janela_iniciada_em" timestamp with time zone NOT NULL,
	"contador" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tentativas_captura_pk" PRIMARY KEY("identificador","janela_iniciada_em"),
	CONSTRAINT "verifica_tentativas_captura_contador" CHECK (contador >= 0)
);
--> statement-breakpoint
CREATE TABLE "tokens_captura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"limite_envios_hora" integer DEFAULT 20 NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	"revogado_por" text,
	CONSTRAINT "verifica_tokens_captura_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "verifica_tokens_captura_limite" CHECK (limite_envios_hora > 0),
	CONSTRAINT "verifica_tokens_captura_revogacao" CHECK ((revogado_em IS NULL) = (revogado_por IS NULL))
);
--> statement-breakpoint
ALTER TABLE "anexos_documentos_capturados" ADD CONSTRAINT "anexos_documentos_capturados_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_documentos_capturados" ADD CONSTRAINT "anexos_documentos_capturados_documento_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos_capturados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_capturados" ADD CONSTRAINT "documentos_capturados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_capturados" ADD CONSTRAINT "documentos_capturados_token_id_tokens_captura_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens_captura"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_capturados" ADD CONSTRAINT "documentos_capturados_titulo_pagar_id_titulos_pagar_id_fk" FOREIGN KEY ("titulo_pagar_id") REFERENCES "public"."titulos_pagar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_capturados" ADD CONSTRAINT "documentos_capturados_conferido_por_user_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_capturados" ADD CONSTRAINT "documentos_capturados_reaberto_por_user_id_fk" FOREIGN KEY ("reaberto_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_captura" ADD CONSTRAINT "tokens_captura_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_captura" ADD CONSTRAINT "tokens_captura_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_captura" ADD CONSTRAINT "tokens_captura_revogado_por_user_id_fk" FOREIGN KEY ("revogado_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_documentos_capturados" ON "anexos_documentos_capturados" USING btree ("documento_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_documentos_capturados_codigo" ON "documentos_capturados" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "documentos_capturados_fila_idx" ON "documentos_capturados" USING btree ("empresa_id","situacao","entrou_na_fila_em");--> statement-breakpoint
CREATE INDEX "documentos_capturados_chave_idx" ON "documentos_capturados" USING btree ("empresa_id","chave_acesso");--> statement-breakpoint
CREATE INDEX "documentos_capturados_retencao_idx" ON "documentos_capturados" USING btree ("data_marco_retencao") WHERE expurgado_em IS NULL AND data_marco_retencao IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_tokens_captura_hash" ON "tokens_captura" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_tokens_captura_ativo_por_empresa" ON "tokens_captura" USING btree ("empresa_id") WHERE revogado_em IS NULL;