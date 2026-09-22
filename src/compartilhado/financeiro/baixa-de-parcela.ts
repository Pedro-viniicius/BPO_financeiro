import { compararDatas, type DataCivil, type DataVencimento } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";

/**
 * A aritmetica de uma parcela: quanto ainda falta e em que situacao ela esta.
 *
 * Vive em `compartilhado/` porque contas a PAGAR e contas a RECEBER fazem
 * exatamente a mesma conta. A ADR-018 manda manter as duas com estruturas
 * separadas no banco — e elas continuam separadas — mas duplicar `original
 * menos baixado` em dois lugares so criaria duas chances de errar. Cada modulo
 * traduz o resultado para o proprio vocabulario ("paga" / "recebida").
 *
 * Nada aqui grava nada: sao funcoes puras sobre valores.
 */

/**
 * Situacao de uma parcela do ponto de vista de quem le a tela.
 *
 * Apenas `aberta`, `liquidada` e `cancelada` existem gravadas no banco (enum
 * `situacao_parcela`). `parcial` e `vencida` sao DERIVADAS aqui, a cada
 * leitura: gravar "vencida" exigiria uma rotina noturna para virar o dia, e
 * uma rotina que falha silenciosamente deixa contas vencidas parecendo em dia.
 */
export type SituacaoDerivada = "aberta" | "parcial" | "vencida" | "liquidada" | "cancelada";

export interface ParcelaParaCalculo {
  readonly valorOriginal: Dinheiro;
  /** Soma do principal das baixas NAO estornadas. */
  readonly valorBaixado: Dinheiro;
  readonly dataVencimento: DataVencimento;
  /** O que esta gravado no banco. `perdida` so existe em contas a receber. */
  readonly situacaoGravada: "aberta" | "liquidada" | "cancelada" | "perdida";
}

/** Quanto ainda falta pagar/receber. Nunca negativo. */
export function saldoRestante(parcela: Pick<ParcelaParaCalculo, "valorOriginal" | "valorBaixado">): Dinheiro {
  const saldo = parcela.valorOriginal.subtrair(parcela.valorBaixado);
  return saldo.ehNegativo() ? Dinheiro.zero() : saldo;
}

/**
 * A situacao que a tela mostra.
 *
 * Ordem importa: cancelada e liquidada sao fatos gravados e vencem qualquer
 * calculo. So depois olhamos a data — uma conta quitada ontem nao e "vencida".
 */
export function situacaoDerivada(parcela: ParcelaParaCalculo, hoje: DataCivil): SituacaoDerivada {
  if (parcela.situacaoGravada === "cancelada") return "cancelada";
  if (parcela.situacaoGravada === "liquidada") return "liquidada";

  const saldo = saldoRestante(parcela);
  // Defesa contra divergencia: se o gravado diz "aberta" mas nao ha saldo, a
  // verdade e o dinheiro. Acontece se alguem mexer no banco por fora.
  if (saldo.ehZero()) return "liquidada";

  if (compararDatas(parcela.dataVencimento, hoje) < 0) return "vencida";
  return parcela.valorBaixado.ehPositivo() ? "parcial" : "aberta";
}


/**
 * O que ainda VAI virar dinheiro nesta parcela.
 *
 * Diferente de `saldoRestante`: uma parcela cancelada com R$ 600 em aberto
 * tem saldo restante de R$ 600 (o fato aritmetico), mas nada disso sera pago
 * ou recebido — o cancelamento zerou a expectativa. Listas e totais usam este
 * valor; o detalhe mostra o outro, para quem precisa saber quanto foi
 * cancelado.
 */
export function saldoEmAberto(parcela: ParcelaParaCalculo): Dinheiro {
  if (parcela.situacaoGravada === "cancelada" || parcela.situacaoGravada === "perdida") return Dinheiro.zero();
  return saldoRestante(parcela);
}

/** Quanto deixou de ser cobrado por cancelamento. Zero quando a parcela nao foi cancelada. */
export function valorCancelado(parcela: ParcelaParaCalculo): Dinheiro {
  return parcela.situacaoGravada === "cancelada" ? saldoRestante(parcela) : Dinheiro.zero();
}

/** Verdadeiro quando ainda ha dinheiro a movimentar nesta parcela. */
export function estaEmAberto(parcela: ParcelaParaCalculo, hoje: DataCivil): boolean {
  const situacao = situacaoDerivada(parcela, hoje);
  return situacao === "aberta" || situacao === "parcial" || situacao === "vencida";
}

export const NOMES_SITUACAO_PAGAR: Record<SituacaoDerivada, string> = {
  aberta: "Em aberto",
  parcial: "Parcialmente paga",
  vencida: "Vencida",
  liquidada: "Paga",
  cancelada: "Cancelada",
};

export const NOMES_SITUACAO_RECEBER: Record<SituacaoDerivada, string> = {
  aberta: "Em aberto",
  parcial: "Parcialmente recebida",
  vencida: "Vencida",
  liquidada: "Recebida",
  cancelada: "Cancelada",
};
