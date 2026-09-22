import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import type { Granularidade, IntervaloDoFluxo } from "../dominio/periodos";

/**
 * Contrato de leitura do fluxo de caixa.
 *
 * Modulo somente de LEITURA: ele nao cria nem altera nada. O dinheiro e
 * criado em contas a pagar, contas a receber e bancos; aqui ele so e
 * organizado no tempo.
 *
 * Como todo repositorio financeiro, recebe `EscopoEmpresa` como primeiro
 * parametro — a ADR-017 nao usa seguranca por linha, e este filtro e a unica
 * barreira entre empresas.
 */

export interface FiltroFluxo {
  readonly de: DataCivil;
  readonly ate: DataCivil;
  readonly granularidade: Granularidade;
  /** Ausente = todas as contas. */
  readonly contaBancariaId?: string;
}

export interface LinhaDoFluxo extends IntervaloDoFluxo {
  readonly saldoInicial: Dinheiro;
  /** Entradas que NAO sao transferencia entre contas proprias. */
  readonly entradas: Dinheiro;
  readonly saidas: Dinheiro;
  /** Entradas menos saidas de transferencia. Zero quando se olha todas as contas. */
  readonly transferenciasLiquidas: Dinheiro;
  readonly saldoFinal: Dinheiro;
  /** Quantos lancamentos formam a linha (para o detalhamento saber se ha o que abrir). */
  readonly quantidade: number;
}

export interface TotaisEmAtraso {
  readonly aReceber: Dinheiro;
  readonly contagemAReceber: number;
  readonly aPagar: Dinheiro;
  readonly contagemAPagar: number;
}

export interface LinhaPorCategoria {
  readonly categoriaNome: string;
  readonly grupoDre: string | null;
  readonly entradas: Dinheiro;
  readonly saidas: Dinheiro;
}

export interface FluxoDeCaixa {
  readonly periodos: readonly LinhaDoFluxo[];
  readonly emAtraso: TotaisEmAtraso;
  /** Abertura do REALIZADO no periodo, agrupada pelo plano de contas. */
  readonly categorias: readonly LinhaPorCategoria[];
  /** Saldo somado das contas consideradas, hoje. */
  readonly saldoAtual: Dinheiro;
  /**
   * Falso quando o filtro fixa uma conta: parcela em aberto ainda nao tem
   * conta bancaria definida, entao prever "nesta conta" seria invencao.
   */
  readonly previstoDisponivel: boolean;
}

/** Uma linha do detalhamento (o que ha por tras de um valor da tabela). */
export interface LancamentoDoFluxo {
  readonly id: string;
  readonly data: DataCivil;
  readonly descricao: string;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly origem: string;
  readonly contaBancariaId: string;
  readonly contaBancariaNome: string;
  readonly categoriaNome: string | null;
  /** Para onde o link leva. Sempre o extrato da conta, que e onde a linha vive. */
  readonly rota: string;
}

/** Uma parcela que ainda vai acontecer (previsto) ou que ja venceu (em atraso). */
export interface ParcelaPrevista {
  readonly parcelaId: string;
  readonly area: "pagar" | "receber";
  readonly codigo: string;
  readonly descricao: string;
  readonly pessoaNome: string;
  readonly dataVencimento: DataCivil;
  readonly saldo: Dinheiro;
  readonly rota: string;
}

export interface RepositorioFluxoCaixa {
  montar(escopo: EscopoEmpresa, filtro: FiltroFluxo, hoje: DataCivil): Promise<FluxoDeCaixa>;
  /** O detalhamento de um periodo realizado. */
  lancamentosDoPeriodo(
    escopo: EscopoEmpresa,
    filtro: FiltroFluxo,
    inicio: DataCivil,
    fim: DataCivil,
  ): Promise<readonly LancamentoDoFluxo[]>;
  /** O detalhamento de um periodo previsto. */
  parcelasDoPeriodo(escopo: EscopoEmpresa, inicio: DataCivil, fim: DataCivil, hoje: DataCivil): Promise<readonly ParcelaPrevista[]>;
  /** As parcelas vencidas e ainda em aberto. Nao entram em nenhum periodo. */
  parcelasEmAtraso(escopo: EscopoEmpresa, hoje: DataCivil): Promise<readonly ParcelaPrevista[]>;
}
