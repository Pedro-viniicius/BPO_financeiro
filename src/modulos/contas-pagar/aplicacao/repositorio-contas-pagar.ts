import type { DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa, PaginaResultado, Paginacao } from "@/compartilhado/tipos/indice";

import type { SituacaoContaPagar } from "../dominio/situacao-conta-pagar";

/**
 * Contrato de repositorio de contas a pagar.
 *
 * Os casos de uso dependem desta interface. A implementacao Drizzle
 * (`infraestrutura/repositorio-contas-pagar-drizzle.ts`, Gate 6) e injetada
 * na composicao. Testes usam uma implementacao em memoria.
 *
 * O tipo `ContaPagar` completo sera definido no Gate 3 (modelo de dados);
 * aqui esta o esqueleto minimo para fixar o padrao.
 */
export interface ResumoContaPagar {
  readonly id: string;
  readonly descricao: string;
  readonly valor: Dinheiro;
  readonly vencimento: DataVencimento;
  readonly situacao: SituacaoContaPagar;
}

export interface FiltroContasPagar {
  readonly situacoes?: readonly SituacaoContaPagar[];
  readonly vencimentoAte?: DataVencimento;
  readonly fornecedorId?: string;
}

export interface RepositorioContasPagar {
  buscarPorId(escopo: EscopoEmpresa, id: string): Promise<ResumoContaPagar | null>;
  listar(escopo: EscopoEmpresa, filtro: FiltroContasPagar, paginacao: Paginacao): Promise<PaginaResultado<ResumoContaPagar>>;
  buscarVencidas(escopo: EscopoEmpresa, hoje: DataVencimento): Promise<readonly ResumoContaPagar[]>;
}
