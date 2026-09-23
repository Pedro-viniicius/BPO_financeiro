-- ============================================================================
-- Contato, endereco e DATA DE CORTE da empresa (Gate 9, item 2).
--
-- Por que e necessaria: a tela de dados da empresa pede razao social, nome
-- fantasia, CNPJ, endereco, telefone e e-mail, e `empresas` so tinha os tres
-- primeiros. Sem estas colunas nao ha onde guardar o resto.
--
-- Colunas na propria `empresas`, e nao uma tabela `enderecos`: e um endereco
-- por empresa, e nenhuma outra entidade do modelo tem endereco hoje. Uma
-- tabela para uma relacao 1:1 custaria um join e uma linha nula em troca de
-- nada.
--
-- `data_inicio_uso` e a data de corte: o dia em que a empresa passou a usar o
-- sistema. E ela que separa o que veio de antes do que nasceu aqui — a carga
-- inicial usa essa data para os saldos bancarios e para saber quais titulos em
-- aberto importar. Sem ela, um saldo informado nao tem a que dia se referir.
--
-- Tudo NULO: as empresas que ja existem continuam validas, e a tela pede o
-- preenchimento sem quebrar nada.
-- ============================================================================

ALTER TABLE "empresas" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "municipio" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "data_inicio_uso" date;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "verifica_empresas_cep" CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "verifica_empresas_uf" CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');