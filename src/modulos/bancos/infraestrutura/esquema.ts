import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaDinheiro, colunaInstante, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { formatoExtrato, tipoContaBancaria, tipoMovimentacao } from "@/banco-dados/esquemas/enumeracoes";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { empresas, filiais } from "@/nucleo/empresas/infraestrutura/esquema";
import { centrosCusto } from "@/modulos/centros-custo/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";

/**
 * Categoria: BANCOS, MOVIMENTACOES E EXTRATOS
 * Documentacao: docs/modelo-dados/categorias/bancos.md, movimentacoes.md, extratos.md
 *
 * - instituicoes_bancarias: o banco (Banco do Brasil). Cadastro da instalacao.
 * - contas_bancarias: a conta da empresa naquele banco (ou o caixa em especie).
 * - movimentacoes_bancarias: o que o SISTEMA entende que entrou/saiu da conta.
 * - extratos_bancarios / itens_extrato_bancario: o que o BANCO informou.
 * A ligacao entre os dois ultimos e a conciliacao (modulo conciliacao-bancaria).
 *
 * SALDO NAO E ARMAZENADO: saldo(conta, data) = saldo_inicial + Σ entradas − Σ saidas
 * ate a data. Ver docs/modelo-dados/categorias/tesouraria.md.
 */

/** Cadastro de instituicoes (nivel da instalacao). Alimentado por semente (Gate 5). */
export const instituicoesBancarias = pgTable(
  "instituicoes_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Codigo de compensacao do Banco Central: "001", "237", "260". Nulo para instituicoes sem codigo. */
    codigoCompensacao: text("codigo_compensacao"),
    nome: text("nome").notNull(),
    ativa: boolean("ativa").notNull().default(true),
  },
  (tabela) => [
    uniqueIndex("unico_instituicoes_codigo").on(tabela.codigoCompensacao).where(sql`codigo_compensacao IS NOT NULL`),
    check("verifica_instituicoes_codigo", sql`codigo_compensacao IS NULL OR codigo_compensacao ~ '^[0-9]{3}$'`),
  ],
);

export const contasBancarias = pgTable(
  "contas_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    filialId: uuid("filial_id").references(() => filiais.id, { onDelete: "restrict" }),
    tipo: tipoContaBancaria("tipo").notNull(),
    /** Apelido que o usuario reconhece: "BB principal", "Caixa da loja". */
    nome: text("nome").notNull(),
    /** Obrigatoria exceto para caixa. */
    instituicaoBancariaId: uuid("instituicao_bancaria_id").references(() => instituicoesBancarias.id, { onDelete: "restrict" }),
    agencia: text("agencia"),
    numeroConta: text("numero_conta"),
    /** Saldo na data de corte informada na configuracao. E o unico saldo gravado; o resto e derivado. */
    saldoInicial: colunaDinheiro("saldo_inicial").notNull().default("0"),
    dataSaldoInicial: colunaDataCivil("data_saldo_inicial").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_contas_bancarias_nome").on(tabela.empresaId, tabela.nome),
    index("contas_bancarias_empresa_idx").on(tabela.empresaId),
    check(
      "verifica_contas_bancarias_instituicao",
      sql`(tipo = 'caixa' AND instituicao_bancaria_id IS NULL) OR (tipo <> 'caixa' AND instituicao_bancaria_id IS NOT NULL)`,
    ),
  ],
);

/** De onde veio a movimentacao. Permite rastrear a origem sem coluna polimorfica: cada origem tem sua tabela apontando para ca. */
export const origemMovimentacao = pgEnum("origem_movimentacao", [
  "pagamento",
  "recebimento",
  "pagamento_divida",
  "transferencia",
  "estorno",
  "ajuste_manual",
  "extrato", // criada a partir de uma linha do extrato (tarifa, rendimento) na conciliacao
]);

export const movimentacoesBancarias = pgTable(
  "movimentacoes_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    dataMovimentacao: colunaDataCivil("data_movimentacao").notNull(),
    tipo: tipoMovimentacao("tipo").notNull(),
    /** Sempre positivo; o sentido esta em `tipo`. */
    valor: colunaDinheiro("valor").notNull(),
    descricao: text("descricao").notNull(),
    origem: origemMovimentacao("origem").notNull(),
    /** Classificacao gerencial. Obrigatoria para origem "extrato" e "ajuste_manual"; para as demais vem do titulo. */
    categoriaId: uuid("categoria_id").references(() => categoriasFinanceiras.id, { onDelete: "restrict" }),
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "restrict" }),
    /** Quando esta movimentacao e o estorno de outra. A original nao e alterada nem apagada. */
    movimentacaoEstornadaId: uuid("movimentacao_estornada_id").references((): AnyPgColumn => movimentacoesBancarias.id, {
      onDelete: "restrict",
    }),
    observacoes: text("observacoes"),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    index("movimentacoes_conta_data_idx").on(tabela.contaBancariaId, tabela.dataMovimentacao),
    index("movimentacoes_empresa_data_idx").on(tabela.empresaId, tabela.dataMovimentacao),
    uniqueIndex("unico_movimentacoes_estorno").on(tabela.movimentacaoEstornadaId).where(sql`movimentacao_estornada_id IS NOT NULL`),
    check("verifica_movimentacoes_valor", sql`valor > 0`),
    check("verifica_movimentacoes_estorno", sql`(origem = 'estorno') = (movimentacao_estornada_id IS NOT NULL)`),
    check(
      "verifica_movimentacoes_categoria",
      sql`origem NOT IN ('extrato', 'ajuste_manual') OR categoria_id IS NOT NULL`,
    ),
  ],
);

export const transferencias = pgTable(
  "transferencias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaOrigemId: uuid("conta_origem_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    contaDestinoId: uuid("conta_destino_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    dataTransferencia: colunaDataCivil("data_transferencia").notNull(),
    valor: colunaDinheiro("valor").notNull(),
    descricao: text("descricao"),
    movimentacaoSaidaId: uuid("movimentacao_saida_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    movimentacaoEntradaId: uuid("movimentacao_entrada_id")
      .notNull()
      .references(() => movimentacoesBancarias.id, { onDelete: "restrict" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_transferencias_saida").on(tabela.movimentacaoSaidaId),
    uniqueIndex("unico_transferencias_entrada").on(tabela.movimentacaoEntradaId),
    index("transferencias_empresa_data_idx").on(tabela.empresaId, tabela.dataTransferencia),
    check("verifica_transferencias_contas", sql`conta_origem_id <> conta_destino_id`),
    check("verifica_transferencias_valor", sql`valor > 0`),
  ],
);

export const extratosBancarios = pgTable(
  "extratos_bancarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    formato: formatoExtrato("formato").notNull(),
    nomeArquivoOriginal: text("nome_arquivo_original").notNull(),
    /** SHA-256 do arquivo. O mesmo arquivo nao pode ser importado duas vezes na mesma conta. */
    impressaoDigital: text("impressao_digital").notNull(),
    /** Metadados do arquivo guardado (opcional; permite reprocessar). */
    arquivoId: uuid("arquivo_id").references(() => arquivos.id, { onDelete: "set null" }),
    dataInicio: colunaDataCivil("data_inicio"),
    dataFim: colunaDataCivil("data_fim"),
    /** Saldo final informado pelo banco no arquivo, quando existir. Serve para conferir com o saldo derivado. */
    saldoFinalInformado: colunaDinheiro("saldo_final_informado"),
    quantidadeItens: integer("quantidade_itens").notNull().default(0),
    importadoEm: colunaInstante("importado_em").notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("unico_extratos_impressao").on(tabela.contaBancariaId, tabela.impressaoDigital),
    index("extratos_conta_data_idx").on(tabela.contaBancariaId, tabela.importadoEm),
    check("verifica_extratos_periodo", sql`data_inicio IS NULL OR data_fim IS NULL OR data_inicio <= data_fim`),
    check("verifica_extratos_quantidade", sql`quantidade_itens >= 0`),
  ],
);

export const itensExtratoBancario = pgTable(
  "itens_extrato_bancario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** CASCADE de proposito: reverter um extrato apaga seus itens. Bloqueado (RESTRICT) se algum item estiver conciliado. */
    extratoBancarioId: uuid("extrato_bancario_id")
      .notNull()
      .references(() => extratosBancarios.id, { onDelete: "cascade" }),
    /** Repetido aqui (esta no extrato) porque a unicidade do identificador externo e POR CONTA, atravessando extratos. */
    contaBancariaId: uuid("conta_bancaria_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "restrict" }),
    dataMovimentacao: colunaDataCivil("data_movimentacao").notNull(),
    tipo: tipoMovimentacao("tipo").notNull(),
    valor: colunaDinheiro("valor").notNull(),
    descricao: text("descricao").notNull(),
    /** Identificador dado pelo banco (FITID no OFX). Base principal da idempotencia. */
    identificadorExterno: text("identificador_externo"),
    /** SHA-256 de (conta, data, tipo, valor, descricao, posicao). Idempotencia para CSV sem identificador. */
    impressaoDigitalLinha: text("impressao_digital_linha").notNull(),
    numeroDocumento: text("numero_documento"),
    /** Linha original como veio do arquivo. Apenas para diagnostico; nunca e fonte de verdade. */
    dadosBrutos: jsonb("dados_brutos"),
    /** Decisao humana de que a linha nao gera movimentacao (ex.: lancamento duplicado pelo banco). */
    ignoradoEm: colunaInstante("ignorado_em"),
    motivoIgnorar: text("motivo_ignorar"),
  },
  (tabela) => [
    uniqueIndex("unico_itens_extrato_identificador")
      .on(tabela.contaBancariaId, tabela.identificadorExterno)
      .where(sql`identificador_externo IS NOT NULL`),
    uniqueIndex("unico_itens_extrato_impressao").on(tabela.contaBancariaId, tabela.impressaoDigitalLinha),
    index("itens_extrato_conta_data_idx").on(tabela.contaBancariaId, tabela.dataMovimentacao),
    index("itens_extrato_extrato_idx").on(tabela.extratoBancarioId),
    check("verifica_itens_extrato_valor", sql`valor > 0`),
    check("verifica_itens_extrato_ignorar", sql`(ignorado_em IS NULL) = (motivo_ignorar IS NULL)`),
  ],
);
