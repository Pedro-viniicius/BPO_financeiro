import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { ParcelaDoCronograma, SistemaAmortizacao, SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * Contrato das dividas da empresa (emprestimos, financiamentos,
 * parcelamentos de tributos).
 *
 * NAO existe fluxo de pagamento proprio. Cada parcela de divida vira uma
 * parcela de conta a pagar, e quem paga e o modulo de contas a pagar, com a
 * baixa, o estorno, o desconto e a conciliacao que ja existem. Manter duas
 * implementacoes de "dar baixa" significaria manter duas vezes cada regra.
 *
 * Como todo repositorio financeiro, recebe `EscopoEmpresa` (ADR-017).
 */

export interface DadosNovaDivida {
  readonly credorPessoaId: string;
  readonly tipo: "emprestimo" | "financiamento" | "cartao_credito" | "cheque_especial" | "outro";
  readonly descricao: string;
  readonly numeroContrato?: string;
  readonly dataContratacao: DataCivil;
  readonly valorPrincipal: Dinheiro;
  /** Taxa MENSAL em pontos percentuais, ja convertida quando informada ao ano. */
  readonly taxaMensal: number;
  readonly sistema: SistemaAmortizacao;
  readonly categoriaJurosId: string;
  /** Quando informada, o credito do emprestimo entra nesta conta. */
  readonly contaBancariaCreditoId?: string;
  readonly observacoes?: string;
  readonly usuarioId: string;
}

export interface ParcelaDaDivida {
  readonly id: string;
  readonly numeroParcela: number;
  readonly dataVencimento: DataVencimento;
  readonly valorAmortizacao: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorTotal: Dinheiro;
  /** Quanto ainda se deve depois desta parcela, pelo cronograma original. */
  readonly saldoDevedor: Dinheiro;
  /** A conta a pagar que representa esta parcela. */
  readonly parcelaPagarId: string | null;
  /** Situacao derivada da conta a pagar: e la que o pagamento acontece. */
  readonly situacao: SituacaoDerivada;
  readonly valorPago: Dinheiro;
}

export interface DividaNaLista {
  readonly id: string;
  readonly codigo: string;
  readonly credorNome: string;
  readonly tipo: string;
  readonly descricao: string;
  readonly valorPrincipal: Dinheiro;
  readonly taxaMensal: number;
  readonly sistema: SistemaAmortizacao;
  readonly saldoDevedor: Dinheiro;
  readonly parcelasPagas: number;
  readonly quantidadeParcelas: number;
  readonly proximoVencimento: DataVencimento | null;
  readonly proximaParcela: Dinheiro | null;
  /** "em_dia" enquanto nada vencer sem pagamento; "quitada" quando o saldo zera. */
  readonly situacao: "em_dia" | "em_atraso" | "quitada" | "cancelada";
  readonly parcelasEmAtraso: number;
}

export interface DividaDetalhada extends DividaNaLista {
  readonly numeroContrato: string | null;
  readonly dataContratacao: DataCivil;
  readonly categoriaJurosNome: string;
  readonly observacoes: string | null;
  readonly tituloPagarId: string | null;
  readonly parcelas: readonly ParcelaDaDivida[];
  readonly totalDeJuros: Dinheiro;
  readonly jurosPagos: Dinheiro;
}

export interface ParcelaNoHorizonte {
  readonly dividaId: string;
  readonly codigo: string;
  readonly credorNome: string;
  readonly dataVencimento: DataVencimento;
  readonly valorTotal: Dinheiro;
  readonly parcelaPagarId: string | null;
}

export interface PainelDeDividas {
  readonly endividamentoTotal: Dinheiro;
  readonly dividasAtivas: number;
  readonly parcelasEmAtraso: number;
  /** As parcelas em aberto dos proximos 12 meses. Tambem aparecem no fluxo de caixa. */
  readonly proximosDozeMeses: readonly ParcelaNoHorizonte[];
  readonly totalProximosDozeMeses: Dinheiro;
  /** Juros efetivamente pagos no ano corrente, pela data da baixa. */
  readonly jurosPagosNoAno: Dinheiro;
}

export interface RepositorioDividas {
  /**
   * Cria a divida, o cronograma, o titulo de contas a pagar com as parcelas
   * vinculadas e, quando pedido, o credito na conta bancaria. Tudo numa
   * transacao so.
   */
  criar(
    escopo: EscopoEmpresa,
    dados: DadosNovaDivida,
    cronograma: readonly ParcelaDoCronograma[],
  ): Promise<{ dividaId: string; tituloPagarId: string }>;
  listar(escopo: EscopoEmpresa, hoje: DataCivil): Promise<readonly DividaNaLista[]>;
  buscarPorId(escopo: EscopoEmpresa, dividaId: string, hoje: DataCivil): Promise<DividaDetalhada | null>;
  painel(escopo: EscopoEmpresa, hoje: DataCivil): Promise<PainelDeDividas>;
  /** Cancela a divida e as parcelas ainda em aberto, no titulo de contas a pagar. */
  cancelar(escopo: EscopoEmpresa, dividaId: string, dados: { motivo: string; usuarioId: string }): Promise<void>;
}
