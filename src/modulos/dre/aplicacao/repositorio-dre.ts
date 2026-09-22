import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import type { DefinicaoDaLinha, LinhaDre } from "../dominio/estrutura-dre";
import type { MesDoResultado, Regime } from "../dominio/periodo-do-resultado";

/**
 * Contrato de leitura do demonstrativo de resultados.
 *
 * Modulo somente de LEITURA: ele nao cria nem altera nada. O dinheiro nasce em
 * contas a pagar, contas a receber, bancos e conciliacao; aqui ele so e
 * classificado e somado.
 *
 * Como todo repositorio financeiro, recebe `EscopoEmpresa` como primeiro
 * parametro — a ADR-017 nao usa seguranca por linha, e este filtro e a unica
 * barreira entre empresas.
 */

export interface FiltroResultado {
  readonly de: DataCivil;
  readonly ate: DataCivil;
  readonly regime: Regime;
  /**
   * So faz sentido no regime de CAIXA: titulo em aberto ainda nao tem conta
   * bancaria, entao filtrar competencia por conta seria invencao.
   */
  readonly contaBancariaId?: string;
}

/** Uma categoria do plano dentro de uma linha do demonstrativo. */
export interface CategoriaNoResultado {
  readonly categoriaNome: string;
  /** Um valor por mes, na mesma ordem de `meses`. */
  readonly porMes: readonly Dinheiro[];
  readonly total: Dinheiro;
}

export interface LinhaDoResultado extends DefinicaoDaLinha {
  readonly porMes: readonly Dinheiro[];
  readonly total: Dinheiro;
  /** Variacao percentual contra o mes anterior. `null` no primeiro mes ou sem base. */
  readonly variacoes: readonly (number | null)[];
  /** Vazio nos subtotais: eles sao conta das linhas acima, nao tem categoria por baixo. */
  readonly categorias: readonly CategoriaNoResultado[];
}

export interface IndicadoresDoResultado {
  readonly receitaLiquida: Dinheiro;
  readonly despesaTotal: Dinheiro;
  readonly resultado: Dinheiro;
  /** Resultado sobre receita liquida, em pontos percentuais. `null` sem receita. */
  readonly margem: number | null;
}

export interface Resultado {
  readonly regime: Regime;
  readonly meses: readonly MesDoResultado[];
  readonly linhas: readonly LinhaDoResultado[];
  readonly indicadores: IndicadoresDoResultado;
  /** Falso quando nao ha lancamento nenhum: a tela mostra o estado vazio. */
  readonly temDados: boolean;
  /** Falso quando o filtro fixa uma conta e o regime e competencia. */
  readonly filtroPorContaDisponivel: boolean;
}

/** Uma linha do detalhamento: o que ha por tras de um valor do demonstrativo. */
export interface LancamentoDoResultado {
  readonly id: string;
  readonly data: DataCivil;
  readonly descricao: string;
  readonly pessoaNome: string | null;
  readonly categoriaNome: string | null;
  readonly tipo: "entrada" | "saida";
  /** Quanto este lancamento contribui PARA A LINHA (ja com o sinal aplicado). */
  readonly valor: Dinheiro;
  readonly origem: string;
  /** Para onde o link leva: a conta, o extrato, ou o titulo. */
  readonly rota: string;
}

export interface RepositorioDre {
  montar(escopo: EscopoEmpresa, filtro: FiltroResultado, hoje: DataCivil): Promise<Resultado>;
  /**
   * O detalhamento de um valor clicado. A soma dos `valor` devolvidos e
   * exatamente o valor que estava na tela — ha teste provando.
   */
  lancamentosDaLinha(
    escopo: EscopoEmpresa,
    filtro: FiltroResultado,
    linha: LinhaDre,
    opcoes?: { readonly competencia?: string; readonly categoriaNome?: string },
  ): Promise<readonly LancamentoDoResultado[]>;
}
