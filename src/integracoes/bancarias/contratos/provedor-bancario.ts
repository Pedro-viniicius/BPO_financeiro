import type { DataMovimentacao } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";

/**
 * Porta (contrato) para provedores bancarios: Open Finance, APIs diretas de
 * bancos, agregadores. Cada banco/provedor vira um adaptador em
 * `provedores/<nome>/` que implementa este contrato.
 *
 * Os modulos financeiros (bancos, conciliacao) dependem SOMENTE deste arquivo.
 * Nenhum SDK bancario e importado fora de `provedores/`. Ver ADR-011.
 */
export interface ContaBancariaExterna {
  readonly identificadorExterno: string;
  readonly banco: string;
  readonly agencia?: string;
  readonly numero?: string;
  readonly descricao: string;
}

export interface MovimentacaoBancariaExterna {
  /** Identificador estavel do lancamento no banco (ex.: FITID no OFX). Base da idempotencia. */
  readonly identificadorExterno: string;
  readonly contaIdentificadorExterno: string;
  readonly data: DataMovimentacao;
  readonly descricao: string;
  /** Positivo = entrada; negativo = saida. */
  readonly valor: Dinheiro;
  readonly tipo?: string;
  readonly contraparteDocumento?: string;
}

export interface PeriodoConsulta {
  readonly inicio: DataMovimentacao;
  readonly fim: DataMovimentacao;
}

export interface ProvedorBancario {
  /** Nome curto do provedor, usado em logs e auditoria (ex.: "open-finance-x"). */
  readonly nome: string;
  obterContas(): Promise<ContaBancariaExterna[]>;
  obterMovimentacoes(contaIdentificadorExterno: string, periodo: PeriodoConsulta): Promise<MovimentacaoBancariaExterna[]>;
  obterSaldo(contaIdentificadorExterno: string): Promise<Dinheiro>;
}
