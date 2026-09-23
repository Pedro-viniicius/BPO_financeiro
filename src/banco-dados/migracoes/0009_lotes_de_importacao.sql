-- ============================================================================
-- Lotes de importacao (Gate 9, item 5).
--
-- Por que e necessaria: a carga inicial precisa poder ser DESFEITA. Planilha
-- de implantacao erra — coluna trocada, valor em outro formato, cliente
-- escrito de dois jeitos. Sem lote, desfazer vira procurar a mao o que entrou,
-- e o que entrou se mistura em minutos com o que foi lancado de verdade.
--
-- Os itens ficam numa tabela GENERICA (entidade + id) em vez de uma coluna
-- `lote_id` em cada tabela financeira. Assim a importacao nao acrescenta
-- coluna a `pessoas`, `clientes`, `fornecedores`, `titulos_pagar` e
-- `titulos_receber`, e desfazer e percorrer uma lista ao contrario — ao
-- contrario por causa das chaves estrangeiras: o titulo sai antes da pessoa.
--
-- O lote NAO e apagado ao ser desfeito: ficam `desfeito_em`, `desfeito_por` e
-- o motivo. Sumir com o registro de uma importacao desfeita apagaria a
-- explicacao de por que os dados de um dia nao batem com os do dia seguinte.
-- ============================================================================

CREATE TYPE "public"."tipo_lote_importacao" AS ENUM('pessoas', 'contas');--> statement-breakpoint
CREATE TABLE "itens_lote_importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"ordem" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes_importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" "tipo_lote_importacao" NOT NULL,
	"arquivo_nome" text NOT NULL,
	"quantidade" integer NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desfeito_em" timestamp with time zone,
	"desfeito_por" text,
	"motivo_desfazer" text,
	CONSTRAINT "verifica_lotes_quantidade" CHECK (quantidade >= 0),
	CONSTRAINT "verifica_lotes_desfazer" CHECK ((desfeito_em IS NULL) = (desfeito_por IS NULL) AND (desfeito_em IS NOT NULL OR motivo_desfazer IS NULL))
);
--> statement-breakpoint
ALTER TABLE "itens_lote_importacao" ADD CONSTRAINT "itens_lote_importacao_lote_id_lotes_importacao_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes_importacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao" ADD CONSTRAINT "lotes_importacao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao" ADD CONSTRAINT "lotes_importacao_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao" ADD CONSTRAINT "lotes_importacao_desfeito_por_user_id_fk" FOREIGN KEY ("desfeito_por") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_lote_importacao_lote_idx" ON "itens_lote_importacao" USING btree ("lote_id","ordem");--> statement-breakpoint
CREATE INDEX "lotes_importacao_empresa_idx" ON "lotes_importacao" USING btree ("empresa_id","criado_em");