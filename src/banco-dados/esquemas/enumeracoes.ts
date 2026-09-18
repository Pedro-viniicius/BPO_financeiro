import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Tipos enumerados (conjuntos finitos de valores) compartilhados entre modulos.
 *
 * Decisao (docs/modelo-dados/padrao-nomenclatura.md, secao "Situacoes"):
 * usamos ENUM do PostgreSQL para conjuntos estaveis do dominio. Adicionar um
 * valor e barato (`ALTER TYPE ... ADD VALUE`); remover exige migracao
 * cuidadosa — por isso so entram aqui valores que sao fatos do negocio, nunca
 * estados derivados (ex.: "vencido" e "parcial" NAO existem como valor: sao
 * calculados a partir de datas e valores).
 *
 * Enums usados por um unico modulo ficam no esquema daquele modulo.
 */

export const tipoPessoa = pgEnum("tipo_pessoa", ["fisica", "juridica"]);

export const tipoContaBancaria = pgEnum("tipo_conta_bancaria", [
  "conta_corrente",
  "conta_poupanca",
  "conta_pagamento",
  "aplicacao",
  "caixa",
]);

/** Sentido de uma movimentacao. O valor e sempre positivo; o sentido esta aqui. */
export const tipoMovimentacao = pgEnum("tipo_movimentacao", ["entrada", "saida"]);

export const formaPagamento = pgEnum("forma_pagamento", [
  "pix",
  "boleto",
  "transferencia",
  "cartao_credito",
  "cartao_debito",
  "dinheiro",
  "debito_automatico",
  "cheque",
  "outro",
]);

/** Situacao de um titulo (a pagar ou a receber). "pago/recebido" e derivado das parcelas. */
export const situacaoTitulo = pgEnum("situacao_titulo", ["rascunho", "aguardando_aprovacao", "aberto", "cancelado"]);

/** Situacao de uma parcela. "parcial" e "vencida" sao derivadas. "perdida" so existe em contas a receber. */
export const situacaoParcela = pgEnum("situacao_parcela", ["aberta", "liquidada", "cancelada", "perdida"]);

/** Situacao de um pagamento/recebimento: imutavel apos registrado, exceto pelo estorno. */
export const situacaoBaixa = pgEnum("situacao_baixa", ["registrado", "estornado"]);

export const frequenciaRecorrencia = pgEnum("frequencia_recorrencia", [
  "semanal",
  "quinzenal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
]);

export const formatoExtrato = pgEnum("formato_extrato", ["ofx", "csv", "xlsx"]);

export const confiancaConciliacao = pgEnum("confianca_conciliacao", ["alta", "possivel", "revisao"]);
