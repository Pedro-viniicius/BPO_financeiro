import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaDinheiro, colunaInstante, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { formaPagamento, frequenciaRecorrencia, situacaoBaixa, situacaoParcela, situacaoTitulo } from "@/banco-dados/esquemas/enumeracoes";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas, filiais } from "@/nucleo/empresas/infraestrutura/esquema";
import { contasBancarias, movimentacoesBancarias } from "@/modulos/bancos/infraestrutura/esquema";
import { clientes } from "@/modulos/cadastros/infraestrutura/esquema";
import { centrosCusto } from "@/modulos/centros-custo/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";

/**
 * Categoria: CONTAS A RECEBER
 * Documentacao: docs/modelo-dados/categorias/contas-receber.md
 *
 *   titulo_receber 1:N parcela_receber 1:N recebimento 1:1 movimentacao_bancaria
 *
 * Difere de contas a pagar em: cliente (nao fornecedor); origem do titulo
 * (manual, faturamento, importacao, recorrencia); nao ha aprovacao;
 * parcela pode ser dada como PERDIDA (baixa por perda, sem dinheiro entrar);
 * recebimento parcial e comum (clientes pagam em partes).
 */
export const origemTituloReceber = pgEnum("origem_titulo_receber", ["manual", "faturamento", "importacao", "recorrencia"]);

export const titulosReceber = pgTable(
  "titulos_receber",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    filialId: uuid("filial_id").references(() => filiais.id, { onDelete: "restrict" }),
    /** Codigo legivel: CR-2026-000045. */
    codigo: text("codigo").notNull(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(),
    /** Numero da nota/fatura emitida pela empresa. Unico por empresa quando informado. */
    numeroDocumento: text("numero_documento"),
    dataEmissao: colunaDataCivil("data_emissao"),
    dataCompetencia: colunaDataCivil("data_competencia").notNull(),
    valorTotal: colunaDinheiro("valor_total").notNull().default("0"),
    quantidadeParcelas: integer("quantidade_parcelas").notNull().default(1),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    situacao: situacaoTitulo("situacao").notNull().default("rascunho"),
    origem: origemTituloReceber("origem").notNull().default("manual"),
    recorrenciaReceberId: uuid("recorrencia_receber_id").references((): AnyPgColumn => recorrenciasReceber.id, { onDelete: "set null" }),
    criadoPorUsuarioId: text("criado_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    canceladoEm: colunaInstante("cancelado_em"),
    motivoCancelamento: text("motivo_cancelamento"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_titulos_receber_codigo").on(tabela.empresaId, tabela.codigo),
    uniqueIndex("unico_titulos_receber_documento")
      .on(tabela.empresaId, tabela.numeroDocumento)
      .where(sql`numero_documento IS NOT NULL AND situacao <> 'cancelado'`),
    index("titulos_receber_empresa_situacao_idx").on(tabela.empresaId, tabela.situacao),
    index("titulos_receber_cliente_idx").on(tabela.clienteId),
    index("titulos_receber_empresa_competencia_idx").on(tabela.empresaId, tabela.dataCompetencia),
    check("verifica_titulos_receber_valor", sql`valor_total >= 0`),
    check("verifica_titulos_receber_parcelas", sql`quantidade_parcelas > 0`),
    check("verifica_titulos_receber_descricao", sql`length(trim(descricao)) > 0`),
    check("verifica_titulos_receber_aprovacao", sql`situacao <> 'aguardando_aprovacao'`),
    check("verifica_titulos_receber_cancelamento", sql`(situacao = 'cancelado') = (cancelado_em IS NOT NULL)`),
  ],
);

export const parcelasReceber = pgTable(
  "parcelas_receber",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tituloReceberId: uuid("titulo_receber_id")
      .notNull()
      .references(() => titulosReceber.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    numeroParcela: integer("numero_parcela").notNull(),
    dataVencimento: colunaDataCivil("data_vencimento").notNull(),
    /** Quando se espera realmente receber (clientes que atrasam sempre). Usada na projecao. */
    dataPrevistaRecebimento: colunaDataCivil("data_prevista_recebimento"),
    valorOriginal: colunaDinheiro("valor_original").notNull(),
    /** Soma do principal dos recebimentos nao estornados. */
    valorRecebido: colunaDinheiro("valor_recebido").notNull().default("0"),
    situacao: situacaoParcela("situacao").notNull().default("aberta"),
    /** Baixa por perda: o saldo em aberto foi considerado incobravel. */
    perdidaEm: colunaInstante("perdida_em"),
    motivoPerda: text("motivo_perda"),
    /** Referencia enviada ao cliente (linha digitavel, PIX copia-e-cola). */
    referenciaCobranca: text("referencia_cobranca"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_parcelas_receber_numero").on(tabela.tituloReceberId, tabela.numeroParcela),
    index("parcelas_receber_empresa_situacao_vencimento_idx").on(tabela.empresaId, tabela.situacao, tabela.dataVencimento),
    check("verifica_parcelas_receber_numero", sql`numero_parcela > 0`),
    check("verifica_parcelas_receber_valor", sql`valor_original > 0`),
    check("verifica_parcelas_receber_valor_recebido", sql`valor_recebido >= 0`),
    check("verifica_parcelas_receber_perda", sql`(situacao = 'perdida') = (perdida_em IS NOT NULL)`),
  ],
);

export const recebimentos = pgTable(
  "recebimentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parcelaReceberId: uuid("parcela_receber_id")
      .notNull()
      .references(() => parcelasReceber.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    movimentacaoBancariaId: uuid("movimentacao_bancaria_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    dataRecebimento: colunaDataCivil("data_recebimento").notNull(),
    valorPrincipal: colunaDinheiro("valor_principal").notNull(),
    valorJuros: colunaDinheiro("valor_juros").notNull().default("0"),
    valorMulta: colunaDinheiro("valor_multa").notNull().default("0"),
    valorDesconto: colunaDinheiro("valor_desconto").notNull().default("0"),
    /** O que entrou na conta: principal + juros + multa − desconto. */
    valorRecebido: colunaDinheiro("valor_recebido").notNull(),
    formaPagamento: formaPagamento("forma_pagamento").notNull(),
    numeroDocumento: text("numero_documento"),
    situacao: situacaoBaixa("situacao").notNull().default("registrado"),
    estornadoEm: colunaInstante("estornado_em"),
    motivoEstorno: text("motivo_estorno"),
    movimentacaoEstornoId: uuid("movimentacao_estorno_id").references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    observacoes: text("observacoes"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_recebimentos_movimentacao").on(tabela.movimentacaoBancariaId),
    uniqueIndex("unico_recebimentos_movimentacao_estorno").on(tabela.movimentacaoEstornoId).where(sql`movimentacao_estorno_id IS NOT NULL`),
    index("recebimentos_parcela_idx").on(tabela.parcelaReceberId),
    index("recebimentos_empresa_data_idx").on(tabela.empresaId, tabela.dataRecebimento),
    check("verifica_recebimentos_valores", sql`valor_principal >= 0 AND valor_juros >= 0 AND valor_multa >= 0 AND valor_desconto >= 0`),
    check("verifica_recebimentos_total", sql`valor_recebido = valor_principal + valor_juros + valor_multa - valor_desconto`),
    check("verifica_recebimentos_valor_recebido", sql`valor_recebido > 0`),
    check(
      "verifica_recebimentos_estorno",
      sql`(situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL)`,
    ),
  ],
);

export const recorrenciasReceber = pgTable(
  "recorrencias_receber",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(),
    valor: colunaDinheiro("valor").notNull(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    frequencia: frequenciaRecorrencia("frequencia").notNull(),
    diaVencimento: integer("dia_vencimento").notNull(),
    dataInicio: colunaDataCivil("data_inicio").notNull(),
    dataFim: colunaDataCivil("data_fim"),
    proximaGeracao: colunaDataCivil("proxima_geracao").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    index("recorrencias_receber_empresa_ativa_idx").on(tabela.empresaId, tabela.ativa, tabela.proximaGeracao),
    check("verifica_recorrencias_receber_valor", sql`valor > 0`),
    check("verifica_recorrencias_receber_dia", sql`dia_vencimento BETWEEN 1 AND 31`),
    check("verifica_recorrencias_receber_periodo", sql`data_fim IS NULL OR data_fim >= data_inicio`),
  ],
);

/** Registro de contato de cobranca (ligacao, mensagem) sobre uma parcela atrasada. Nao e CRM. */
export const contatosCobranca = pgTable(
  "contatos_cobranca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parcelaReceberId: uuid("parcela_receber_id")
      .notNull()
      .references(() => parcelasReceber.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    dataContato: colunaDataCivil("data_contato").notNull(),
    /** telefone, whatsapp, email, presencial, outro — texto livre curto; sem envio automatico no MVP. */
    canal: text("canal").notNull(),
    resumo: text("resumo").notNull(),
    proximaAcao: text("proxima_acao"),
    dataProximaAcao: colunaDataCivil("data_proxima_acao"),
    registradoPorUsuarioId: text("registrado_por_usuario_id").references(() => user.id, { onDelete: "set null" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    index("contatos_cobranca_parcela_idx").on(tabela.parcelaReceberId, tabela.dataContato),
    index("contatos_cobranca_proxima_acao_idx").on(tabela.empresaId, tabela.dataProximaAcao),
    check("verifica_contatos_cobranca_resumo", sql`length(trim(resumo)) > 0`),
  ],
);

export const anexosTitulosReceber = pgTable(
  "anexos_titulos_receber",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tituloReceberId: uuid("titulo_receber_id")
      .notNull()
      .references(() => titulosReceber.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex("unico_anexos_titulos_receber").on(tabela.tituloReceberId, tabela.arquivoId)],
);

export const anexosRecebimentos = pgTable(
  "anexos_recebimentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recebimentoId: uuid("recebimento_id")
      .notNull()
      .references(() => recebimentos.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex("unico_anexos_recebimentos").on(tabela.recebimentoId, tabela.arquivoId)],
);

export const relacoesTitulosReceber = relations(titulosReceber, ({ many, one }) => ({
  parcelas: many(parcelasReceber),
  cliente: one(clientes, { fields: [titulosReceber.clienteId], references: [clientes.id] }),
  categoria: one(categoriasFinanceiras, { fields: [titulosReceber.categoriaId], references: [categoriasFinanceiras.id] }),
}));

export const relacoesParcelasReceber = relations(parcelasReceber, ({ many, one }) => ({
  titulo: one(titulosReceber, { fields: [parcelasReceber.tituloReceberId], references: [titulosReceber.id] }),
  recebimentos: many(recebimentos),
  contatosCobranca: many(contatosCobranca),
}));

export const relacoesRecebimentos = relations(recebimentos, ({ one }) => ({
  parcela: one(parcelasReceber, { fields: [recebimentos.parcelaReceberId], references: [parcelasReceber.id] }),
  movimentacao: one(movimentacoesBancarias, { fields: [recebimentos.movimentacaoBancariaId], references: [movimentacoesBancarias.id] }),
}));
