import type { DataCivil } from "./data-civil";

/**
 * Nomes distintos para cada significado de data no dominio financeiro.
 *
 * Todos sao datas civis, mas o NOME do tipo (e da coluna no banco) carrega o
 * significado. Nunca use um campo generico "data". Ver glossario, secao 4.
 */

/** Mes/dia a que a receita ou despesa pertence economicamente (regime de competencia). */
export type DataCompetencia = DataCivil;

/** Data limite para pagar ou receber. */
export type DataVencimento = DataCivil;

/** Data em que se espera que o dinheiro realmente se mova (usada na projecao de caixa). */
export type DataPrevista = DataCivil;

/** Data em que o pagamento de fato ocorreu. So existe apos "Marcar como pago". */
export type DataPagamento = DataCivil;

/** Data em que o recebimento de fato ocorreu. So existe apos "Confirmar recebimento". */
export type DataRecebimento = DataCivil;

/** Data de emissao do documento de origem (nota, fatura, boleto). */
export type DataEmissao = DataCivil;

/** Data em que a movimentacao aconteceu na conta financeira (data do extrato). */
export type DataMovimentacao = DataCivil;

/** Data em que a conciliacao foi confirmada por uma pessoa. */
export type DataConciliacao = DataCivil;

/**
 * Instante tecnico: momento exato em que algo aconteceu no sistema
 * (criado_em, atualizado_em, auditoria). Sempre em UTC. Nunca e usado como
 * data de negocio.
 */
export type InstanteTecnico = Date;
