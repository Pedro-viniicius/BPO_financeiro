import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaDinheiro, colunaInstante, colunaPercentual, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { formaPagamento, situacaoBaixa } from "@/banco-dados/esquemas/enumeracoes";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";
import { contasBancarias, movimentacoesBancarias } from "@/modulos/bancos/infraestrutura/esquema";
import { pessoas } from "@/modulos/cadastros/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";

/**
 * Categoria: CREDITO E DIVIDAS
 * Documentacao: docs/modelo-dados/categorias/credito-dividas.md
 *
 * Emprestimos e financiamentos NAO sao contas a pagar comuns: tem principal,
 * taxa de juros, amortizacao e saldo devedor. Cada parcela separa juros
 * (despesa financeira na DRE) de amortizacao (reducao da divida, nao e despesa).
 *
 * saldo_devedor NAO e armazenado: = valor_principal − Σ amortizacao das parcelas pagas.
 */
export const tipoDivida = pgEnum("tipo_divida", ["emprestimo", "financiamento", "cartao_credito", "cheque_especial", "outro"]);
export const situacaoDivida = pgEnum("situacao_divida", ["ativa", "quitada", "cancelada"]);
export const sistemaAmortizacao = pgEnum("sistema_amortizacao", ["price", "sac", "outro"]);
export const situacaoParcelaDivida = pgEnum("situacao_parcela_divida", ["aberta", "paga", "cancelada"]);

export const dividas = pgTable(
  "dividas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Codigo legivel: DV-2026-000003. */
    codigo: text("codigo").notNull(),
    /** Credor (banco, financeira, pessoa). Cadastrado como pessoa da organizacao. */
    credorPessoaId: uuid("credor_pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    tipo: tipoDivida("tipo").notNull(),
    descricao: text("descricao").notNull(),
    numeroContrato: text("numero_contrato"),
    dataContratacao: colunaDataCivil("data_contratacao").notNull(),
    valorPrincipal: colunaDinheiro("valor_principal").notNull(),
    taxaJurosMensal: colunaPercentual("taxa_juros_mensal").notNull().default("0"),
    sistemaAmortizacao: sistemaAmortizacao("sistema_amortizacao").notNull().default("outro"),
    quantidadeParcelas: integer("quantidade_parcelas").notNull(),
    /** Categoria usada para os juros pagos (despesa financeira). */
    categoriaJurosId: uuid("categoria_juros_id")
      .notNull()
      .references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    /** Conta em que o dinheiro do emprestimo entrou (quando registrado). */
    contaBancariaCreditoId: uuid("conta_bancaria_credito_id").references(() => contasBancarias.id, { onDelete: "restrict" }),
    /** Texto livre; garantias sao metadados opcionais, nao entidades. */
    garantias: text("garantias"),
    situacao: situacaoDivida("situacao").notNull().default("ativa"),
    observacoes: text("observacoes"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_dividas_codigo").on(tabela.empresaId, tabela.codigo),
    index("dividas_empresa_situacao_idx").on(tabela.empresaId, tabela.situacao),
    check("verifica_dividas_principal", sql`valor_principal > 0`),
    check("verifica_dividas_taxa", sql`taxa_juros_mensal >= 0`),
    check("verifica_dividas_parcelas", sql`quantidade_parcelas > 0`),
  ],
);

export const parcelasDivida = pgTable(
  "parcelas_divida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dividaId: uuid("divida_id")
      .notNull()
      .references(() => dividas.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    numeroParcela: integer("numero_parcela").notNull(),
    dataVencimento: colunaDataCivil("data_vencimento").notNull(),
    valorAmortizacao: colunaDinheiro("valor_amortizacao").notNull(),
    valorJuros: colunaDinheiro("valor_juros").notNull().default("0"),
    /** amortizacao + juros. Garantido por CHECK. */
    valorTotal: colunaDinheiro("valor_total").notNull(),
    situacao: situacaoParcelaDivida("situacao").notNull().default("aberta"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_parcelas_divida_numero").on(tabela.dividaId, tabela.numeroParcela),
    index("parcelas_divida_empresa_situacao_vencimento_idx").on(tabela.empresaId, tabela.situacao, tabela.dataVencimento),
    check("verifica_parcelas_divida_numero", sql`numero_parcela > 0`),
    check("verifica_parcelas_divida_valores", sql`valor_amortizacao >= 0 AND valor_juros >= 0`),
    check("verifica_parcelas_divida_total", sql`valor_total = valor_amortizacao + valor_juros AND valor_total > 0`),
  ],
);

export const pagamentosDivida = pgTable(
  "pagamentos_divida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parcelaDividaId: uuid("parcela_divida_id")
      .notNull()
      .references(() => parcelasDivida.id, { onDelete: "restrict" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    movimentacaoBancariaId: uuid("movimentacao_bancaria_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    dataPagamento: colunaDataCivil("data_pagamento").notNull(),
    valorPago: colunaDinheiro("valor_pago").notNull(),
    /** Juros/multa cobrados por atraso, alem do previsto na parcela. */
    valorEncargosAtraso: colunaDinheiro("valor_encargos_atraso").notNull().default("0"),
    formaPagamento: formaPagamento("forma_pagamento").notNull(),
    situacao: situacaoBaixa("situacao").notNull().default("registrado"),
    estornadoEm: colunaInstante("estornado_em"),
    motivoEstorno: text("motivo_estorno"),
    movimentacaoEstornoId: uuid("movimentacao_estorno_id").references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_pagamentos_divida_movimentacao").on(tabela.movimentacaoBancariaId),
    index("pagamentos_divida_parcela_idx").on(tabela.parcelaDividaId),
    check("verifica_pagamentos_divida_valor", sql`valor_pago > 0 AND valor_encargos_atraso >= 0`),
    check(
      "verifica_pagamentos_divida_estorno",
      sql`(situacao = 'estornado') = (estornado_em IS NOT NULL) AND (situacao = 'estornado') = (movimentacao_estorno_id IS NOT NULL)`,
    ),
  ],
);

export const anexosDividas = pgTable(
  "anexos_dividas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dividaId: uuid("divida_id")
      .notNull()
      .references(() => dividas.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [uniqueIndex("unico_anexos_dividas").on(tabela.dividaId, tabela.arquivoId)],
);

export const relacoesDividas = relations(dividas, ({ many }) => ({
  parcelas: many(parcelasDivida),
}));

export const relacoesParcelasDivida = relations(parcelasDivida, ({ many, one }) => ({
  divida: one(dividas, { fields: [parcelasDivida.dividaId], references: [dividas.id] }),
  pagamentos: many(pagamentosDivida),
}));
