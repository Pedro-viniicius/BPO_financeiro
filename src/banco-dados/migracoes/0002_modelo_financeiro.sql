CREATE TYPE "public"."confianca_conciliacao" AS ENUM('alta', 'possivel', 'revisao');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento" AS ENUM('pix', 'boleto', 'transferencia', 'cartao_credito', 'cartao_debito', 'dinheiro', 'debito_automatico', 'cheque', 'outro');--> statement-breakpoint
CREATE TYPE "public"."formato_extrato" AS ENUM('ofx', 'csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."frequencia_recorrencia" AS ENUM('semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."situacao_baixa" AS ENUM('registrado', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."situacao_parcela" AS ENUM('aberta', 'liquidada', 'cancelada', 'perdida');--> statement-breakpoint
CREATE TYPE "public"."situacao_titulo" AS ENUM('rascunho', 'aguardando_aprovacao', 'aberto', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta_bancaria" AS ENUM('conta_corrente', 'conta_poupanca', 'conta_pagamento', 'aplicacao', 'caixa');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimentacao" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('fisica', 'juridica');--> statement-breakpoint
CREATE TYPE "public"."grupo_dre" AS ENUM('receita_bruta', 'deducao', 'custo', 'despesa_operacional', 'resultado_financeiro', 'nao_operacional', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."natureza_custo" AS ENUM('fixo', 'variavel');--> statement-breakpoint
CREATE TYPE "public"."origem_movimentacao" AS ENUM('pagamento', 'recebimento', 'pagamento_divida', 'transferencia', 'estorno', 'ajuste_manual', 'extrato');--> statement-breakpoint
CREATE TYPE "public"."origem_decisao_conciliacao" AS ENUM('manual', 'sugestao_aceita', 'lote');--> statement-breakpoint
CREATE TYPE "public"."origem_titulo_receber" AS ENUM('manual', 'faturamento', 'importacao', 'recorrencia');--> statement-breakpoint
CREATE TYPE "public"."sistema_amortizacao" AS ENUM('price', 'sac', 'outro');--> statement-breakpoint
CREATE TYPE "public"."situacao_divida" AS ENUM('ativa', 'quitada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."situacao_parcela_divida" AS ENUM('aberta', 'paga', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_divida" AS ENUM('emprestimo', 'financiamento', 'cartao_credito', 'cheque_especial', 'outro');--> statement-breakpoint
CREATE TYPE "public"."situacao_orcamento" AS ENUM('rascunho', 'ativo', 'encerrado');--> statement-breakpoint
CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave_armazenamento" text NOT NULL,
	"nome_original" text NOT NULL,
	"tipo_conteudo" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"impressao_digital" text NOT NULL,
	"enviado_por_usuario_id" text,
	"removido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_arquivos_tamanho" CHECK (tamanho_bytes > 0),
	CONSTRAINT "verifica_arquivos_impressao" CHECK (impressao_digital ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "sequencias_codigo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"prefixo" text NOT NULL,
	"ano" integer NOT NULL,
	"ultimo_numero" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_sequencias_numero" CHECK (ultimo_numero >= 0),
	CONSTRAINT "verifica_sequencias_ano" CHECK (ano BETWEEN 2000 AND 2200)
);
--> statement-breakpoint
CREATE TABLE "anexos_pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"prazo_padrao_dias" integer,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_clientes_prazo" CHECK (prazo_padrao_dias IS NULL OR prazo_padrao_dias >= 0)
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"tipo" "tipo_pessoa" NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text,
	"cpf_cnpj" text,
	"email" text,
	"telefone" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_pessoas_documento" CHECK (cpf_cnpj IS NULL OR (tipo = 'fisica' AND cpf_cnpj ~ '^[0-9]{11}$') OR (tipo = 'juridica' AND cpf_cnpj ~ '^[0-9]{14}$')),
	CONSTRAINT "verifica_pessoas_nome" CHECK (length(trim(nome)) > 0)
);
--> statement-breakpoint
CREATE TABLE "categorias_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"conta_plano_id" uuid NOT NULL,
	"categoria_pai_id" uuid,
	"natureza_custo" "natureza_custo",
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_categorias_nome" CHECK (length(trim(nome)) > 0),
	CONSTRAINT "verifica_categorias_sem_autorreferencia" CHECK (categoria_pai_id IS NULL OR categoria_pai_id <> id)
);
--> statement-breakpoint
CREATE TABLE "contas_plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"grupo_dre" "grupo_dre" NOT NULL,
	"conta_pai_id" uuid,
	"aceita_classificacao" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_contas_plano_codigo" CHECK (codigo ~ '^[0-9]+(\.[0-9]+)*$'),
	CONSTRAINT "verifica_contas_plano_sem_autorreferencia" CHECK (conta_pai_id IS NULL OR conta_pai_id <> id)
);
--> statement-breakpoint
CREATE TABLE "centros_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"filial_id" uuid,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"centro_pai_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_centros_custo_sem_autorreferencia" CHECK (centro_pai_id IS NULL OR centro_pai_id <> id)
);
--> statement-breakpoint
CREATE TABLE "contas_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"filial_id" uuid,
	"tipo" "tipo_conta_bancaria" NOT NULL,
	"nome" text NOT NULL,
	"instituicao_bancaria_id" uuid,
	"agencia" text,
	"numero_conta" text,
	"saldo_inicial" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_saldo_inicial" date NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_contas_bancarias_instituicao" CHECK ((tipo = 'caixa' AND instituicao_bancaria_id IS NULL) OR (tipo <> 'caixa' AND instituicao_bancaria_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "extratos_bancarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"formato" "formato_extrato" NOT NULL,
	"nome_arquivo_original" text NOT NULL,
	"impressao_digital" text NOT NULL,
	"arquivo_id" uuid,
	"data_inicio" date,
	"data_fim" date,
	"saldo_final_informado" numeric(15, 2),
	"quantidade_itens" integer DEFAULT 0 NOT NULL,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_extratos_periodo" CHECK (data_inicio IS NULL OR data_fim IS NULL OR data_inicio <= data_fim),
	CONSTRAINT "verifica_extratos_quantidade" CHECK (quantidade_itens >= 0)
);
--> statement-breakpoint
CREATE TABLE "instituicoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_compensacao" text,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "verifica_instituicoes_codigo" CHECK (codigo_compensacao IS NULL OR codigo_compensacao ~ '^[0-9]{3}$')
);
--> statement-breakpoint
CREATE TABLE "itens_extrato_bancario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extrato_bancario_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"data_movimentacao" date NOT NULL,
	"tipo" "tipo_movimentacao" NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"descricao" text NOT NULL,
	"identificador_externo" text,
	"impressao_digital_linha" text NOT NULL,
	"numero_documento" text,
	"dados_brutos" jsonb,
	"ignorado_em" timestamp with time zone,
	"motivo_ignorar" text,
	CONSTRAINT "verifica_itens_extrato_valor" CHECK (valor > 0),
	CONSTRAINT "verifica_itens_extrato_ignorar" CHECK ((ignorado_em IS NULL) = (motivo_ignorar IS NULL))
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"data_movimentacao" date NOT NULL,
	"tipo" "tipo_movimentacao" NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"descricao" text NOT NULL,
	"origem" "origem_movimentacao" NOT NULL,
	"categoria_id" uuid,
	"centro_custo_id" uuid,
	"movimentacao_estornada_id" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_movimentacoes_valor" CHECK (valor > 0),
	CONSTRAINT "verifica_movimentacoes_estorno" CHECK ((origem = 'estorno') = (movimentacao_estornada_id IS NOT NULL)),
	CONSTRAINT "verifica_movimentacoes_categoria" CHECK (origem NOT IN ('extrato', 'ajuste_manual') OR categoria_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_origem_id" uuid NOT NULL,
	"conta_destino_id" uuid NOT NULL,
	"data_transferencia" date NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"descricao" text,
	"movimentacao_saida_id" uuid NOT NULL,
	"movimentacao_entrada_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_transferencias_contas" CHECK (conta_origem_id <> conta_destino_id),
	CONSTRAINT "verifica_transferencias_valor" CHECK (valor > 0)
);
--> statement-breakpoint
CREATE TABLE "conciliacoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"data_conciliacao" date NOT NULL,
	"confianca" "confianca_conciliacao" NOT NULL,
	"origem_decisao" "origem_decisao_conciliacao" NOT NULL,
	"decidida_por_usuario_id" text,
	"observacoes" text,
	"desfeita_em" timestamp with time zone,
	"motivo_desfazer" text,
	"desfeita_por_usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_conciliacoes_desfazer" CHECK ((desfeita_em IS NULL) = (motivo_desfazer IS NULL))
);
--> statement-breakpoint
CREATE TABLE "conciliacoes_itens_extrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conciliacao_id" uuid NOT NULL,
	"item_extrato_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conciliacoes_movimentacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conciliacao_id" uuid NOT NULL,
	"movimentacao_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexos_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pagamento_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexos_titulos_pagar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_pagar_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcela_pagar_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"movimentacao_bancaria_id" uuid NOT NULL,
	"data_pagamento" date NOT NULL,
	"valor_principal" numeric(15, 2) NOT NULL,
	"valor_juros" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_multa" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_pago" numeric(15, 2) NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"numero_documento" text,
	"situacao" "situacao_baixa" DEFAULT 'registrado' NOT NULL,
	"estornado_em" timestamp with time zone,
	"motivo_estorno" text,
	"movimentacao_estorno_id" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_pagamentos_valores" CHECK (valor_principal >= 0 AND valor_juros >= 0 AND valor_multa >= 0 AND valor_desconto >= 0),
	CONSTRAINT "verifica_pagamentos_total" CHECK (valor_pago = valor_principal + valor_juros + valor_multa - valor_desconto),
	CONSTRAINT "verifica_pagamentos_valor_pago" CHECK (valor_pago > 0),
	CONSTRAINT "verifica_pagamentos_estorno" CHECK ((situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "parcelas_pagar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_pagar_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero_parcela" integer NOT NULL,
	"data_vencimento" date NOT NULL,
	"data_prevista_pagamento" date,
	"valor_original" numeric(15, 2) NOT NULL,
	"valor_pago" numeric(15, 2) DEFAULT '0' NOT NULL,
	"situacao" "situacao_parcela" DEFAULT 'aberta' NOT NULL,
	"forma_pagamento_prevista" "forma_pagamento",
	"conta_bancaria_prevista_id" uuid,
	"referencia_pagamento" text,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_parcelas_pagar_numero" CHECK (numero_parcela > 0),
	CONSTRAINT "verifica_parcelas_pagar_valor" CHECK (valor_original > 0),
	CONSTRAINT "verifica_parcelas_pagar_valor_pago" CHECK (valor_pago >= 0),
	CONSTRAINT "verifica_parcelas_pagar_perdida" CHECK (situacao <> 'perdida')
);
--> statement-breakpoint
CREATE TABLE "recorrencias_pagar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"frequencia" "frequencia_recorrencia" NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"proxima_geracao" date NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_recorrencias_pagar_valor" CHECK (valor > 0),
	CONSTRAINT "verifica_recorrencias_pagar_dia" CHECK (dia_vencimento BETWEEN 1 AND 31),
	CONSTRAINT "verifica_recorrencias_pagar_periodo" CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);
--> statement-breakpoint
CREATE TABLE "titulos_pagar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"filial_id" uuid,
	"codigo" text NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"numero_documento" text,
	"data_emissao" date,
	"data_competencia" date NOT NULL,
	"valor_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"quantidade_parcelas" integer DEFAULT 1 NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"situacao" "situacao_titulo" DEFAULT 'rascunho' NOT NULL,
	"recorrencia_pagar_id" uuid,
	"criado_por_usuario_id" text,
	"aprovado_por_usuario_id" text,
	"aprovado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_titulos_pagar_valor" CHECK (valor_total >= 0),
	CONSTRAINT "verifica_titulos_pagar_parcelas" CHECK (quantidade_parcelas > 0),
	CONSTRAINT "verifica_titulos_pagar_descricao" CHECK (length(trim(descricao)) > 0),
	CONSTRAINT "verifica_titulos_pagar_aprovador" CHECK (aprovado_por_usuario_id IS NULL OR criado_por_usuario_id IS NULL OR aprovado_por_usuario_id <> criado_por_usuario_id),
	CONSTRAINT "verifica_titulos_pagar_cancelamento" CHECK ((situacao = 'cancelado') = (cancelado_em IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "anexos_recebimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recebimento_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexos_titulos_receber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_receber_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos_cobranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcela_receber_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data_contato" date NOT NULL,
	"canal" text NOT NULL,
	"resumo" text NOT NULL,
	"proxima_acao" text,
	"data_proxima_acao" date,
	"registrado_por_usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_contatos_cobranca_resumo" CHECK (length(trim(resumo)) > 0)
);
--> statement-breakpoint
CREATE TABLE "parcelas_receber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_receber_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero_parcela" integer NOT NULL,
	"data_vencimento" date NOT NULL,
	"data_prevista_recebimento" date,
	"valor_original" numeric(15, 2) NOT NULL,
	"valor_recebido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"situacao" "situacao_parcela" DEFAULT 'aberta' NOT NULL,
	"perdida_em" timestamp with time zone,
	"motivo_perda" text,
	"referencia_cobranca" text,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_parcelas_receber_numero" CHECK (numero_parcela > 0),
	CONSTRAINT "verifica_parcelas_receber_valor" CHECK (valor_original > 0),
	CONSTRAINT "verifica_parcelas_receber_valor_recebido" CHECK (valor_recebido >= 0),
	CONSTRAINT "verifica_parcelas_receber_perda" CHECK ((situacao = 'perdida') = (perdida_em IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recebimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcela_receber_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"movimentacao_bancaria_id" uuid NOT NULL,
	"data_recebimento" date NOT NULL,
	"valor_principal" numeric(15, 2) NOT NULL,
	"valor_juros" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_multa" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_recebido" numeric(15, 2) NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"numero_documento" text,
	"situacao" "situacao_baixa" DEFAULT 'registrado' NOT NULL,
	"estornado_em" timestamp with time zone,
	"motivo_estorno" text,
	"movimentacao_estorno_id" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_recebimentos_valores" CHECK (valor_principal >= 0 AND valor_juros >= 0 AND valor_multa >= 0 AND valor_desconto >= 0),
	CONSTRAINT "verifica_recebimentos_total" CHECK (valor_recebido = valor_principal + valor_juros + valor_multa - valor_desconto),
	CONSTRAINT "verifica_recebimentos_valor_recebido" CHECK (valor_recebido > 0),
	CONSTRAINT "verifica_recebimentos_estorno" CHECK ((situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recorrencias_receber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"frequencia" "frequencia_recorrencia" NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"proxima_geracao" date NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_recorrencias_receber_valor" CHECK (valor > 0),
	CONSTRAINT "verifica_recorrencias_receber_dia" CHECK (dia_vencimento BETWEEN 1 AND 31),
	CONSTRAINT "verifica_recorrencias_receber_periodo" CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);
--> statement-breakpoint
CREATE TABLE "titulos_receber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"filial_id" uuid,
	"codigo" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"numero_documento" text,
	"data_emissao" date,
	"data_competencia" date NOT NULL,
	"valor_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"quantidade_parcelas" integer DEFAULT 1 NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"situacao" "situacao_titulo" DEFAULT 'rascunho' NOT NULL,
	"origem" "origem_titulo_receber" DEFAULT 'manual' NOT NULL,
	"recorrencia_receber_id" uuid,
	"criado_por_usuario_id" text,
	"cancelado_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_titulos_receber_valor" CHECK (valor_total >= 0),
	CONSTRAINT "verifica_titulos_receber_parcelas" CHECK (quantidade_parcelas > 0),
	CONSTRAINT "verifica_titulos_receber_descricao" CHECK (length(trim(descricao)) > 0),
	CONSTRAINT "verifica_titulos_receber_aprovacao" CHECK (situacao <> 'aguardando_aprovacao'),
	CONSTRAINT "verifica_titulos_receber_cancelamento" CHECK ((situacao = 'cancelado') = (cancelado_em IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "anexos_dividas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"divida_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"credor_pessoa_id" uuid NOT NULL,
	"tipo" "tipo_divida" NOT NULL,
	"descricao" text NOT NULL,
	"numero_contrato" text,
	"data_contratacao" date NOT NULL,
	"valor_principal" numeric(15, 2) NOT NULL,
	"taxa_juros_mensal" numeric(9, 4) DEFAULT '0' NOT NULL,
	"sistema_amortizacao" "sistema_amortizacao" DEFAULT 'outro' NOT NULL,
	"quantidade_parcelas" integer NOT NULL,
	"categoria_juros_id" uuid NOT NULL,
	"conta_bancaria_credito_id" uuid,
	"garantias" text,
	"situacao" "situacao_divida" DEFAULT 'ativa' NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_dividas_principal" CHECK (valor_principal > 0),
	CONSTRAINT "verifica_dividas_taxa" CHECK (taxa_juros_mensal >= 0),
	CONSTRAINT "verifica_dividas_parcelas" CHECK (quantidade_parcelas > 0)
);
--> statement-breakpoint
CREATE TABLE "pagamentos_divida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcela_divida_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_bancaria_id" uuid NOT NULL,
	"movimentacao_bancaria_id" uuid NOT NULL,
	"data_pagamento" date NOT NULL,
	"valor_pago" numeric(15, 2) NOT NULL,
	"valor_encargos_atraso" numeric(15, 2) DEFAULT '0' NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"situacao" "situacao_baixa" DEFAULT 'registrado' NOT NULL,
	"estornado_em" timestamp with time zone,
	"motivo_estorno" text,
	"movimentacao_estorno_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_pagamentos_divida_valor" CHECK (valor_pago > 0 AND valor_encargos_atraso >= 0),
	CONSTRAINT "verifica_pagamentos_divida_estorno" CHECK ((situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "parcelas_divida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"divida_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero_parcela" integer NOT NULL,
	"data_vencimento" date NOT NULL,
	"valor_amortizacao" numeric(15, 2) NOT NULL,
	"valor_juros" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(15, 2) NOT NULL,
	"situacao" "situacao_parcela_divida" DEFAULT 'aberta' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_parcelas_divida_numero" CHECK (numero_parcela > 0),
	CONSTRAINT "verifica_parcelas_divida_valores" CHECK (valor_amortizacao >= 0 AND valor_juros >= 0),
	CONSTRAINT "verifica_parcelas_divida_total" CHECK (valor_total = valor_amortizacao + valor_juros AND valor_total > 0)
);
--> statement-breakpoint
CREATE TABLE "itens_orcamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"valor_planejado" numeric(15, 2) NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_itens_orcamento_valor" CHECK (valor_planejado >= 0),
	CONSTRAINT "verifica_itens_orcamento_competencia" CHECK (extract(day from competencia) = 1)
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ano" integer NOT NULL,
	"situacao" "situacao_orcamento" DEFAULT 'rascunho' NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifica_orcamentos_ano" CHECK (ano BETWEEN 2000 AND 2200)
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_usuario_id_user_id_fk" FOREIGN KEY ("enviado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencias_codigo" ADD CONSTRAINT "sequencias_codigo_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_pessoas" ADD CONSTRAINT "anexos_pessoas_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_pessoas" ADD CONSTRAINT "anexos_pessoas_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_conta_plano_id_contas_plano_id_fk" FOREIGN KEY ("conta_plano_id") REFERENCES "public"."contas_plano"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_categoria_pai_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_pai_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_plano" ADD CONSTRAINT "contas_plano_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_plano" ADD CONSTRAINT "contas_plano_conta_pai_id_contas_plano_id_fk" FOREIGN KEY ("conta_pai_id") REFERENCES "public"."contas_plano"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_filial_id_filiais_id_fk" FOREIGN KEY ("filial_id") REFERENCES "public"."filiais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_centro_pai_id_centros_custo_id_fk" FOREIGN KEY ("centro_pai_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_filial_id_filiais_id_fk" FOREIGN KEY ("filial_id") REFERENCES "public"."filiais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_instituicao_bancaria_id_instituicoes_bancarias_id_fk" FOREIGN KEY ("instituicao_bancaria_id") REFERENCES "public"."instituicoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extratos_bancarios" ADD CONSTRAINT "extratos_bancarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extratos_bancarios" ADD CONSTRAINT "extratos_bancarios_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extratos_bancarios" ADD CONSTRAINT "extratos_bancarios_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_extrato_bancario" ADD CONSTRAINT "itens_extrato_bancario_extrato_bancario_id_extratos_bancarios_id_fk" FOREIGN KEY ("extrato_bancario_id") REFERENCES "public"."extratos_bancarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_extrato_bancario" ADD CONSTRAINT "itens_extrato_bancario_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_movimentacao_estornada_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_estornada_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_origem_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_destino_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_movimentacao_saida_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_saida_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_movimentacao_entrada_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_entrada_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_bancarias" ADD CONSTRAINT "conciliacoes_bancarias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_bancarias" ADD CONSTRAINT "conciliacoes_bancarias_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_bancarias" ADD CONSTRAINT "conciliacoes_bancarias_decidida_por_usuario_id_user_id_fk" FOREIGN KEY ("decidida_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_bancarias" ADD CONSTRAINT "conciliacoes_bancarias_desfeita_por_usuario_id_user_id_fk" FOREIGN KEY ("desfeita_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_itens_extrato" ADD CONSTRAINT "conciliacoes_itens_extrato_conciliacao_id_conciliacoes_bancarias_id_fk" FOREIGN KEY ("conciliacao_id") REFERENCES "public"."conciliacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_itens_extrato" ADD CONSTRAINT "conciliacoes_itens_extrato_item_extrato_id_itens_extrato_bancario_id_fk" FOREIGN KEY ("item_extrato_id") REFERENCES "public"."itens_extrato_bancario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_movimentacoes" ADD CONSTRAINT "conciliacoes_movimentacoes_conciliacao_id_conciliacoes_bancarias_id_fk" FOREIGN KEY ("conciliacao_id") REFERENCES "public"."conciliacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_movimentacoes" ADD CONSTRAINT "conciliacoes_movimentacoes_movimentacao_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_pagamentos" ADD CONSTRAINT "anexos_pagamentos_pagamento_id_pagamentos_id_fk" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_pagamentos" ADD CONSTRAINT "anexos_pagamentos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_titulos_pagar" ADD CONSTRAINT "anexos_titulos_pagar_titulo_pagar_id_titulos_pagar_id_fk" FOREIGN KEY ("titulo_pagar_id") REFERENCES "public"."titulos_pagar"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_titulos_pagar" ADD CONSTRAINT "anexos_titulos_pagar_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_parcela_pagar_id_parcelas_pagar_id_fk" FOREIGN KEY ("parcela_pagar_id") REFERENCES "public"."parcelas_pagar"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_movimentacao_bancaria_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_bancaria_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_movimentacao_estorno_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_estorno_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_pagar" ADD CONSTRAINT "parcelas_pagar_titulo_pagar_id_titulos_pagar_id_fk" FOREIGN KEY ("titulo_pagar_id") REFERENCES "public"."titulos_pagar"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_pagar" ADD CONSTRAINT "parcelas_pagar_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_pagar" ADD CONSTRAINT "parcelas_pagar_conta_bancaria_prevista_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_prevista_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_pagar" ADD CONSTRAINT "recorrencias_pagar_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_pagar" ADD CONSTRAINT "recorrencias_pagar_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_pagar" ADD CONSTRAINT "recorrencias_pagar_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_pagar" ADD CONSTRAINT "recorrencias_pagar_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_filial_id_filiais_id_fk" FOREIGN KEY ("filial_id") REFERENCES "public"."filiais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_recorrencia_pagar_id_recorrencias_pagar_id_fk" FOREIGN KEY ("recorrencia_pagar_id") REFERENCES "public"."recorrencias_pagar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_criado_por_usuario_id_user_id_fk" FOREIGN KEY ("criado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_pagar" ADD CONSTRAINT "titulos_pagar_aprovado_por_usuario_id_user_id_fk" FOREIGN KEY ("aprovado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_recebimentos" ADD CONSTRAINT "anexos_recebimentos_recebimento_id_recebimentos_id_fk" FOREIGN KEY ("recebimento_id") REFERENCES "public"."recebimentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_recebimentos" ADD CONSTRAINT "anexos_recebimentos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_titulos_receber" ADD CONSTRAINT "anexos_titulos_receber_titulo_receber_id_titulos_receber_id_fk" FOREIGN KEY ("titulo_receber_id") REFERENCES "public"."titulos_receber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_titulos_receber" ADD CONSTRAINT "anexos_titulos_receber_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos_cobranca" ADD CONSTRAINT "contatos_cobranca_parcela_receber_id_parcelas_receber_id_fk" FOREIGN KEY ("parcela_receber_id") REFERENCES "public"."parcelas_receber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos_cobranca" ADD CONSTRAINT "contatos_cobranca_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos_cobranca" ADD CONSTRAINT "contatos_cobranca_registrado_por_usuario_id_user_id_fk" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_receber" ADD CONSTRAINT "parcelas_receber_titulo_receber_id_titulos_receber_id_fk" FOREIGN KEY ("titulo_receber_id") REFERENCES "public"."titulos_receber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_receber" ADD CONSTRAINT "parcelas_receber_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_parcela_receber_id_parcelas_receber_id_fk" FOREIGN KEY ("parcela_receber_id") REFERENCES "public"."parcelas_receber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_movimentacao_bancaria_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_bancaria_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_movimentacao_estorno_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_estorno_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_receber" ADD CONSTRAINT "recorrencias_receber_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_receber" ADD CONSTRAINT "recorrencias_receber_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_receber" ADD CONSTRAINT "recorrencias_receber_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias_receber" ADD CONSTRAINT "recorrencias_receber_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_filial_id_filiais_id_fk" FOREIGN KEY ("filial_id") REFERENCES "public"."filiais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_recorrencia_receber_id_recorrencias_receber_id_fk" FOREIGN KEY ("recorrencia_receber_id") REFERENCES "public"."recorrencias_receber"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_criado_por_usuario_id_user_id_fk" FOREIGN KEY ("criado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_dividas" ADD CONSTRAINT "anexos_dividas_divida_id_dividas_id_fk" FOREIGN KEY ("divida_id") REFERENCES "public"."dividas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_dividas" ADD CONSTRAINT "anexos_dividas_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_credor_pessoa_id_pessoas_id_fk" FOREIGN KEY ("credor_pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_categoria_juros_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_juros_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_conta_bancaria_credito_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_credito_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_parcela_divida_id_parcelas_divida_id_fk" FOREIGN KEY ("parcela_divida_id") REFERENCES "public"."parcelas_divida"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_conta_bancaria_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_bancaria_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_movimentacao_bancaria_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_bancaria_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_movimentacao_estorno_id_movimentacoes_bancarias_id_fk" FOREIGN KEY ("movimentacao_estorno_id") REFERENCES "public"."movimentacoes_bancarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_divida" ADD CONSTRAINT "parcelas_divida_divida_id_dividas_id_fk" FOREIGN KEY ("divida_id") REFERENCES "public"."dividas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_divida" ADD CONSTRAINT "parcelas_divida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_orcamento_id_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_arquivos_chave" ON "arquivos" USING btree ("chave_armazenamento");--> statement-breakpoint
CREATE INDEX "arquivos_empresa_impressao_idx" ON "arquivos" USING btree ("empresa_id","impressao_digital");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_sequencias_codigo" ON "sequencias_codigo" USING btree ("empresa_id","prefixo","ano");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_pessoas" ON "anexos_pessoas" USING btree ("pessoa_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_clientes_empresa_pessoa" ON "clientes" USING btree ("empresa_id","pessoa_id");--> statement-breakpoint
CREATE INDEX "clientes_empresa_idx" ON "clientes" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_fornecedores_empresa_pessoa" ON "fornecedores" USING btree ("empresa_id","pessoa_id");--> statement-breakpoint
CREATE INDEX "fornecedores_empresa_idx" ON "fornecedores" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "pessoas_organizacao_nome_idx" ON "pessoas" USING btree ("organizacao_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_pessoas_documento" ON "pessoas" USING btree ("organizacao_id","cpf_cnpj") WHERE cpf_cnpj IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_categorias_nome" ON "categorias_financeiras" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE INDEX "categorias_empresa_conta_plano_idx" ON "categorias_financeiras" USING btree ("empresa_id","conta_plano_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_contas_plano_codigo" ON "contas_plano" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "contas_plano_empresa_grupo_idx" ON "contas_plano" USING btree ("empresa_id","grupo_dre");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_centros_custo_codigo" ON "centros_custo" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "centros_custo_empresa_idx" ON "centros_custo" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_contas_bancarias_nome" ON "contas_bancarias" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE INDEX "contas_bancarias_empresa_idx" ON "contas_bancarias" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_extratos_impressao" ON "extratos_bancarios" USING btree ("conta_bancaria_id","impressao_digital");--> statement-breakpoint
CREATE INDEX "extratos_conta_data_idx" ON "extratos_bancarios" USING btree ("conta_bancaria_id","importado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_instituicoes_codigo" ON "instituicoes_bancarias" USING btree ("codigo_compensacao") WHERE codigo_compensacao IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_itens_extrato_identificador" ON "itens_extrato_bancario" USING btree ("conta_bancaria_id","identificador_externo") WHERE identificador_externo IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_itens_extrato_impressao" ON "itens_extrato_bancario" USING btree ("conta_bancaria_id","impressao_digital_linha");--> statement-breakpoint
CREATE INDEX "itens_extrato_conta_data_idx" ON "itens_extrato_bancario" USING btree ("conta_bancaria_id","data_movimentacao");--> statement-breakpoint
CREATE INDEX "itens_extrato_extrato_idx" ON "itens_extrato_bancario" USING btree ("extrato_bancario_id");--> statement-breakpoint
CREATE INDEX "movimentacoes_conta_data_idx" ON "movimentacoes_bancarias" USING btree ("conta_bancaria_id","data_movimentacao");--> statement-breakpoint
CREATE INDEX "movimentacoes_empresa_data_idx" ON "movimentacoes_bancarias" USING btree ("empresa_id","data_movimentacao");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_movimentacoes_estorno" ON "movimentacoes_bancarias" USING btree ("movimentacao_estornada_id") WHERE movimentacao_estornada_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_transferencias_saida" ON "transferencias" USING btree ("movimentacao_saida_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_transferencias_entrada" ON "transferencias" USING btree ("movimentacao_entrada_id");--> statement-breakpoint
CREATE INDEX "transferencias_empresa_data_idx" ON "transferencias" USING btree ("empresa_id","data_transferencia");--> statement-breakpoint
CREATE INDEX "conciliacoes_conta_data_idx" ON "conciliacoes_bancarias" USING btree ("conta_bancaria_id","data_conciliacao");--> statement-breakpoint
CREATE INDEX "conciliacoes_empresa_idx" ON "conciliacoes_bancarias" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_conciliacao_item_ativo" ON "conciliacoes_itens_extrato" USING btree ("item_extrato_id") WHERE ativo = true;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_conciliacao_item_vinculo" ON "conciliacoes_itens_extrato" USING btree ("conciliacao_id","item_extrato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_conciliacao_movimentacao_ativa" ON "conciliacoes_movimentacoes" USING btree ("movimentacao_id") WHERE ativo = true;--> statement-breakpoint
CREATE UNIQUE INDEX "unico_conciliacao_movimentacao_vinculo" ON "conciliacoes_movimentacoes" USING btree ("conciliacao_id","movimentacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_pagamentos" ON "anexos_pagamentos" USING btree ("pagamento_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_titulos_pagar" ON "anexos_titulos_pagar" USING btree ("titulo_pagar_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_pagamentos_movimentacao" ON "pagamentos" USING btree ("movimentacao_bancaria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_pagamentos_movimentacao_estorno" ON "pagamentos" USING btree ("movimentacao_estorno_id") WHERE movimentacao_estorno_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pagamentos_parcela_idx" ON "pagamentos" USING btree ("parcela_pagar_id");--> statement-breakpoint
CREATE INDEX "pagamentos_empresa_data_idx" ON "pagamentos" USING btree ("empresa_id","data_pagamento");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_parcelas_pagar_numero" ON "parcelas_pagar" USING btree ("titulo_pagar_id","numero_parcela");--> statement-breakpoint
CREATE INDEX "parcelas_pagar_empresa_situacao_vencimento_idx" ON "parcelas_pagar" USING btree ("empresa_id","situacao","data_vencimento");--> statement-breakpoint
CREATE INDEX "recorrencias_pagar_empresa_ativa_idx" ON "recorrencias_pagar" USING btree ("empresa_id","ativa","proxima_geracao");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_titulos_pagar_codigo" ON "titulos_pagar" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_titulos_pagar_documento" ON "titulos_pagar" USING btree ("fornecedor_id","numero_documento") WHERE numero_documento IS NOT NULL AND situacao <> 'cancelado';--> statement-breakpoint
CREATE INDEX "titulos_pagar_empresa_situacao_idx" ON "titulos_pagar" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "titulos_pagar_fornecedor_idx" ON "titulos_pagar" USING btree ("fornecedor_id");--> statement-breakpoint
CREATE INDEX "titulos_pagar_empresa_competencia_idx" ON "titulos_pagar" USING btree ("empresa_id","data_competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_recebimentos" ON "anexos_recebimentos" USING btree ("recebimento_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_titulos_receber" ON "anexos_titulos_receber" USING btree ("titulo_receber_id","arquivo_id");--> statement-breakpoint
CREATE INDEX "contatos_cobranca_parcela_idx" ON "contatos_cobranca" USING btree ("parcela_receber_id","data_contato");--> statement-breakpoint
CREATE INDEX "contatos_cobranca_proxima_acao_idx" ON "contatos_cobranca" USING btree ("empresa_id","data_proxima_acao");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_parcelas_receber_numero" ON "parcelas_receber" USING btree ("titulo_receber_id","numero_parcela");--> statement-breakpoint
CREATE INDEX "parcelas_receber_empresa_situacao_vencimento_idx" ON "parcelas_receber" USING btree ("empresa_id","situacao","data_vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_recebimentos_movimentacao" ON "recebimentos" USING btree ("movimentacao_bancaria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_recebimentos_movimentacao_estorno" ON "recebimentos" USING btree ("movimentacao_estorno_id") WHERE movimentacao_estorno_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recebimentos_parcela_idx" ON "recebimentos" USING btree ("parcela_receber_id");--> statement-breakpoint
CREATE INDEX "recebimentos_empresa_data_idx" ON "recebimentos" USING btree ("empresa_id","data_recebimento");--> statement-breakpoint
CREATE INDEX "recorrencias_receber_empresa_ativa_idx" ON "recorrencias_receber" USING btree ("empresa_id","ativa","proxima_geracao");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_titulos_receber_codigo" ON "titulos_receber" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_titulos_receber_documento" ON "titulos_receber" USING btree ("empresa_id","numero_documento") WHERE numero_documento IS NOT NULL AND situacao <> 'cancelado';--> statement-breakpoint
CREATE INDEX "titulos_receber_empresa_situacao_idx" ON "titulos_receber" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "titulos_receber_cliente_idx" ON "titulos_receber" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "titulos_receber_empresa_competencia_idx" ON "titulos_receber" USING btree ("empresa_id","data_competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_anexos_dividas" ON "anexos_dividas" USING btree ("divida_id","arquivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_dividas_codigo" ON "dividas" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "dividas_empresa_situacao_idx" ON "dividas" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_pagamentos_divida_movimentacao" ON "pagamentos_divida" USING btree ("movimentacao_bancaria_id");--> statement-breakpoint
CREATE INDEX "pagamentos_divida_parcela_idx" ON "pagamentos_divida" USING btree ("parcela_divida_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_parcelas_divida_numero" ON "parcelas_divida" USING btree ("divida_id","numero_parcela");--> statement-breakpoint
CREATE INDEX "parcelas_divida_empresa_situacao_vencimento_idx" ON "parcelas_divida" USING btree ("empresa_id","situacao","data_vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_itens_orcamento_dimensoes" ON "itens_orcamento" USING btree ("orcamento_id","competencia","categoria_id",coalesce("centro_custo_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "itens_orcamento_categoria_competencia_idx" ON "itens_orcamento" USING btree ("categoria_id","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "unico_orcamentos_nome" ON "orcamentos" USING btree ("empresa_id","ano","nome");--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_ano_idx" ON "orcamentos" USING btree ("empresa_id","ano");--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "verifica_empresas_cnpj" CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "verifica_empresas_nome" CHECK (length(trim(nome)) > 0);