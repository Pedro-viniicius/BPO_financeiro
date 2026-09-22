-- Gate 6 (Tesouraria): quem importou o extrato.
--
-- `extratos_bancarios` guardava quando o arquivo entrou, de qual conta e
-- quantos itens tinha, mas nao QUEM o enviou. Numa importacao que traz
-- centenas de lancamentos e alimenta a conciliacao, saber o autor e parte da
-- trilha: e a primeira pergunta quando um extrato errado e importado.
--
-- Mesmo padrao do resto do modelo (`criado_por_usuario_id`,
-- `decidida_por_usuario_id`, `enviado_por_usuario_id`): nullable, porque uma
-- importacao futura por tarefa agendada nao tem usuario, e ON DELETE SET NULL,
-- porque apagar um usuario nao pode apagar o historico do extrato.

ALTER TABLE "extratos_bancarios" ADD COLUMN "importado_por_usuario_id" text;--> statement-breakpoint
ALTER TABLE "extratos_bancarios" ADD CONSTRAINT "extratos_bancarios_importado_por_usuario_id_user_id_fk" FOREIGN KEY ("importado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
