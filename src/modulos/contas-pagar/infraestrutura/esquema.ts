import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaDinheiro, colunaInstante, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { formaPagamento, frequenciaRecorrencia, situacaoBaixa, situacaoParcela, situacaoTitulo } from "@/banco-dados/esquemas/enumeracoes";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas, filiais } from "@/nucleo/empresas/infraestrutura/esquema";
import { contasBancarias, movimentacoesBancarias } from "@/modulos/bancos/infraestrutura/esquema";
import { fornecedores } from "@/modulos/cadastros/infraestrutura/esquema";
import { centrosCusto } from "@/modulos/centros-custo/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";

/**
 * Categoria: CONTAS A PAGAR
 * Documentacao: docs/modelo-dados/categorias/contas-pagar.md
 *
 *   titulo_pagar 1:N parcela_pagar 1:N pagamento 1:1 movimentacao_bancaria
 *
 * - titulo: a obrigacao (nota, boleto, contrato) com fornecedor, competencia e classificacao.
 * - parcela: cada vencimento. Uma parcela pode receber varios pagamentos (parcial).
 * - pagamento: o ato. Imutavel; so pode ser estornado (gera movimentacao inversa).
 * "Vencida" e "parcial" sao derivadas; "pago" no titulo e derivado das parcelas.
 */
export const titulosPagar = pgTable(
  "titulos_pagar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    filialId: uuid("filial_id").references(() => filiais.id, { onDelete: "restrict" }),
    /** Codigo legivel: CP-2026-000123. Gerado por sequencias_codigo. */
    codigo: text("codigo").notNull(),
    fornecedorId: uuid("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(),
    /** Numero do documento de origem (nota, boleto, contrato). Unico por fornecedor quando informado. */
    numeroDocumento: text("numero_documento"),
    dataEmissao: colunaDataCivil("data_emissao"),
    /** Mes/dia a que a despesa pertence economicamente. Base da DRE por competencia. */
    dataCompetencia: colunaDataCivil("data_competencia").notNull(),
    /** Soma de valor_original das parcelas. Mantida pela aplicacao na mesma transacao (ver docs: desnormalizacao). */
    valorTotal: colunaDinheiro("valor_total").notNull().default("0"),
    quantidadeParcelas: integer("quantidade_parcelas").notNull().default(1),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    situacao: situacaoTitulo("situacao").notNull().default("rascunho"),
    /** Preenchido quando o titulo foi gerado por uma recorrencia. */
    recorrenciaPagarId: uuid("recorrencia_pagar_id").references((): AnyPgColumn => recorrenciasPagar.id, { onDelete: "set null" }),
    criadoPorUsuarioId: text("criado_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    aprovadoPorUsuarioId: text("aprovado_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    aprovadoEm: colunaInstante("aprovado_em"),
    canceladoEm: colunaInstante("cancelado_em"),
    motivoCancelamento: text("motivo_cancelamento"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_titulos_pagar_codigo").on(tabela.empresaId, tabela.codigo),
    uniqueIndex("unico_titulos_pagar_documento")
      .on(tabela.fornecedorId, tabela.numeroDocumento)
      .where(sql`numero_documento IS NOT NULL AND situacao <> 'cancelado'`),
    index("titulos_pagar_empresa_situacao_idx").on(tabela.empresaId, tabela.situacao),
    index("titulos_pagar_fornecedor_idx").on(tabela.fornecedorId),
    index("titulos_pagar_empresa_competencia_idx").on(tabela.empresaId, tabela.dataCompetencia),
    check("verifica_titulos_pagar_valor", sql`valor_total >= 0`),
    check("verifica_titulos_pagar_parcelas", sql`quantidade_parcelas > 0`),
    check("verifica_titulos_pagar_descricao", sql`length(trim(descricao)) > 0`),
    // Segregacao de funcoes: quem registrou nao aprova.
    check(
      "verifica_titulos_pagar_aprovador",
      sql`aprovado_por_usuario_id IS NULL OR criado_por_usuario_id IS NULL OR aprovado_por_usuario_id <> criado_por_usuario_id`,
    ),
    check("verifica_titulos_pagar_cancelamento", sql`(situacao = 'cancelado') = (cancelado_em IS NOT NULL)`),
  ],
);

export const parcelasPagar = pgTable(
  "parcelas_pagar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tituloPagarId: uuid("titulo_pagar_id")
      .notNull()
      .references(() => titulosPagar.id, { onDelete: "restrict" }),
    /** Repetido para a consulta mais frequente do sistema ("vencidas da empresa") nao exigir juncao. */
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    numeroParcela: integer("numero_parcela").notNull(),
    dataVencimento: colunaDataCivil("data_vencimento").notNull(),
    /** Quando se espera realmente pagar (pode diferir do vencimento). Usada na projecao de caixa. */
    dataPrevistaPagamento: colunaDataCivil("data_prevista_pagamento"),
    valorOriginal: colunaDinheiro("valor_original").notNull(),
    /** Soma do principal dos pagamentos nao estornados. Mantido na transacao de pagamento/estorno. */
    valorPago: colunaDinheiro("valor_pago").notNull().default("0"),
    situacao: situacaoParcela("situacao").notNull().default("aberta"),
    formaPagamentoPrevista: formaPagamento("forma_pagamento_prevista"),
    contaBancariaPrevistaId: uuid("conta_bancaria_prevista_id").references(() => contasBancarias.id, { onDelete: "set null" }),
    /** Codigo de barras / linha digitavel / chave PIX do documento, quando houver. */
    referenciaPagamento: text("referencia_pagamento"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_parcelas_pagar_numero").on(tabela.tituloPagarId, tabela.numeroParcela),
    // Consulta principal: parcelas abertas de uma empresa por vencimento (Hoje, vencidas, fluxo previsto).
    index("parcelas_pagar_empresa_situacao_vencimento_idx").on(tabela.empresaId, tabela.situacao, tabela.dataVencimento),
    check("verifica_parcelas_pagar_numero", sql`numero_parcela > 0`),
    check("verifica_parcelas_pagar_valor", sql`valor_original > 0`),
    check("verifica_parcelas_pagar_valor_pago", sql`valor_pago >= 0`),
    check("verifica_parcelas_pagar_perdida", sql`situacao <> 'perdida'`),
  ],
);

export const pagamentos = pgTable(
  "pagamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parcelaPagarId: uuid("parcela_pagar_id")
      .notNull()
      .references(() => parcelasPagar.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    /** A saida de dinheiro correspondente. Exatamente uma por pagamento. */
    movimentacaoBancariaId: uuid("movimentacao_bancaria_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    dataPagamento: colunaDataCivil("data_pagamento").notNull(),
    /** Parte que abate a parcela. */
    valorPrincipal: colunaDinheiro("valor_principal").notNull(),
    valorJuros: colunaDinheiro("valor_juros").notNull().default("0"),
    valorMulta: colunaDinheiro("valor_multa").notNull().default("0"),
    valorDesconto: colunaDinheiro("valor_desconto").notNull().default("0"),
    /** O que saiu da conta: principal + juros + multa − desconto. Garantido por CHECK. */
    valorPago: colunaDinheiro("valor_pago").notNull(),
    formaPagamento: formaPagamento("forma_pagamento").notNull(),
    numeroDocumento: text("numero_documento"),
    situacao: situacaoBaixa("situacao").notNull().default("registrado"),
    estornadoEm: colunaInstante("estornado_em"),
    motivoEstorno: text("motivo_estorno"),
    /** Movimentacao inversa criada no estorno. */
    movimentacaoEstornoId: uuid("movimentacao_estorno_id").references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    observacoes: text("observacoes"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_pagamentos_movimentacao").on(tabela.movimentacaoBancariaId),
    uniqueIndex("unico_pagamentos_movimentacao_estorno").on(tabela.movimentacaoEstornoId).where(sql`movimentacao_estorno_id IS NOT NULL`),
    index("pagamentos_parcela_idx").on(tabela.parcelaPagarId),
    index("pagamentos_empresa_data_idx").on(tabela.empresaId, tabela.dataPagamento),
    check("verifica_pagamentos_valores", sql`valor_principal >= 0 AND valor_juros >= 0 AND valor_multa >= 0 AND valor_desconto >= 0`),
    check("verifica_pagamentos_total", sql`valor_pago = valor_principal + valor_juros + valor_multa - valor_desconto`),
    check("verifica_pagamentos_valor_pago", sql`valor_pago > 0`),
    check(
      "verifica_pagamentos_estorno",
      sql`(situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL)`,
    ),
  ],
);

/** Modelo que gera titulos a pagar repetidos (aluguel todo dia 5). */
export const recorrenciasPagar = pgTable(
  "recorrencias_pagar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    fornecedorId: uuid("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(),
    valor: colunaDinheiro("valor").notNull(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    frequencia: frequenciaRecorrencia("frequencia").notNull(),
    /** Dia do mes do vencimento (1-31; ajustado ao ultimo dia quando o mes e menor). */
    diaVencimento: integer("dia_vencimento").notNull(),
    dataInicio: colunaDataCivil("data_inicio").notNull(),
    dataFim: colunaDataCivil("data_fim"),
    /** Proxima competencia a gerar. A geracao e idempotente por (recorrencia, competencia). */
    proximaGeracao: colunaDataCivil("proxima_geracao").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    index("recorrencias_pagar_empresa_ativa_idx").on(tabela.empresaId, tabela.ativa, tabela.proximaGeracao),
    check("verifica_recorrencias_pagar_valor", sql`valor > 0`),
    check("verifica_recorrencias_pagar_dia", sql`dia_vencimento BETWEEN 1 AND 31`),
    check("verifica_recorrencias_pagar_periodo", sql`data_fim IS NULL OR data_fim >= data_inicio`),
  ],
);

export const anexosTitulosPagar = pgTable(
  "anexos_titulos_pagar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tituloPagarId: uuid("titulo_pagar_id")
      .notNull()
      .references(() => titulosPagar.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex("unico_anexos_titulos_pagar").on(tabela.tituloPagarId, tabela.arquivoId)],
);

export const anexosPagamentos = pgTable(
  "anexos_pagamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pagamentoId: uuid("pagamento_id")
      .notNull()
      .references(() => pagamentos.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex("unico_anexos_pagamentos").on(tabela.pagamentoId, tabela.arquivoId)],
);

// ---- Relacoes (para consultas tipadas com `with`). Nao substituem as chaves estrangeiras acima. ----

export const relacoesTitulosPagar = relations(titulosPagar, ({ many, one }) => ({
  parcelas: many(parcelasPagar),
  fornecedor: one(fornecedores, { fields: [titulosPagar.fornecedorId], references: [fornecedores.id] }),
  categoria: one(categoriasFinanceiras, { fields: [titulosPagar.categoriaId], references: [categoriasFinanceiras.id] }),
  anexos: many(anexosTitulosPagar),
}));

export const relacoesParcelasPagar = relations(parcelasPagar, ({ many, one }) => ({
  titulo: one(titulosPagar, { fields: [parcelasPagar.tituloPagarId], references: [titulosPagar.id] }),
  pagamentos: many(pagamentos),
}));

export const relacoesPagamentos = relations(pagamentos, ({ one }) => ({
  parcela: one(parcelasPagar, { fields: [pagamentos.parcelaPagarId], references: [parcelasPagar.id] }),
  movimentacao: one(movimentacoesBancarias, { fields: [pagamentos.movimentacaoBancariaId], references: [movimentacoesBancarias.id] }),
}));
