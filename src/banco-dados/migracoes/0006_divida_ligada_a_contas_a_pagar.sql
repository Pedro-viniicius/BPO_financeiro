-- Gate 8 (Dividas): a ponte entre uma parcela de divida e a conta a pagar.
--
-- O modelo do Gate 3 previu `parcelas_divida` e `pagamentos_divida`, ou seja,
-- um fluxo de pagamento PROPRIO para dividas. O Gate 8 decidiu o contrario:
-- quem paga e o modulo de contas a pagar, com a baixa, o estorno, o desconto e
-- a conciliacao que ja existem e ja foram verificados. Criar um segundo fluxo
-- de pagamento significaria manter duas vezes cada uma dessas regras.
--
-- Faltava, entao, a ligacao entre os dois lados. E por esta coluna que o
-- demonstrativo de resultados descobre, a partir de uma baixa, quanto e juros
-- (despesa financeira) e quanto e amortizacao (reducao da divida, que nao e
-- despesa e nao pode aparecer no resultado).
--
-- Nullable porque uma parcela de divida pode existir antes de virar conta a
-- pagar, e ON DELETE RESTRICT porque apagar a conta a pagar nao pode deixar a
-- parcela da divida apontando para o vazio. O indice unico parcial garante
-- 1:1: uma conta a pagar nunca representa duas parcelas de divida.

ALTER TABLE "parcelas_divida" ADD COLUMN "parcela_pagar_id" uuid;--> statement-breakpoint
ALTER TABLE "parcelas_divida" ADD CONSTRAINT "parcelas_divida_parcela_pagar_id_parcelas_pagar_id_fk" FOREIGN KEY ("parcela_pagar_id") REFERENCES "public"."parcelas_pagar"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_parcelas_divida_conta_pagar" ON "parcelas_divida" USING btree ("parcela_pagar_id") WHERE parcela_pagar_id IS NOT NULL;
