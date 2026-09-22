import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { Regime } from "@/modulos/dre/publico";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import type { ExecucaoDoPeriodo, NaturezaOrcada, ValoresDoAno } from "../dominio/planilha-do-orcamento";

/**
 * Contrato do orcamento anual.
 *
 * O PLANEJADO e gravado aqui. O REALIZADO nao: ele vem do modulo `dre`, a
 * mesma fonte da tela de Resultados. Se o orcamento calculasse o realizado por
 * conta propria, uma categoria poderia aparecer com R$ 8.000 no Resultados e
 * R$ 8.100 no Orcamento, e nao haveria como saber qual esta certo.
 *
 * Como todo repositorio financeiro, recebe `EscopoEmpresa` como primeiro
 * parametro (ADR-017).
 */

export interface LinhaDoPlanejamento {
  readonly categoriaId: string;
  readonly categoriaNome: string;
  readonly grupoDre: string | null;
  readonly natureza: NaturezaOrcada | null;
  /** Doze valores, de janeiro a dezembro. */
  readonly porMes: ValoresDoAno;
  readonly total: Dinheiro;
}

export interface Planejamento {
  readonly ano: number;
  readonly orcamentoId: string | null;
  readonly linhas: readonly LinhaDoPlanejamento[];
  readonly total: Dinheiro;
}

export interface LinhaDoAcompanhamento {
  readonly categoriaId: string;
  readonly categoriaNome: string;
  readonly grupoDre: string | null;
  readonly natureza: NaturezaOrcada;
  readonly planejadoPorMes: ValoresDoAno;
  readonly realizadoPorMes: ValoresDoAno;
  /** Comparacao do mes escolhido. */
  readonly noMes: ExecucaoDoPeriodo;
  /** Comparacao de janeiro ate o mes escolhido. */
  readonly acumulado: ExecucaoDoPeriodo;
}

export interface GrupoDoAcompanhamento {
  readonly grupo: string;
  readonly rotulo: string;
  readonly natureza: NaturezaOrcada;
  readonly linhas: readonly LinhaDoAcompanhamento[];
  readonly noMes: ExecucaoDoPeriodo;
  readonly acumulado: ExecucaoDoPeriodo;
}

export interface AcompanhamentoDoOrcamento {
  readonly ano: number;
  /** 1 a 12. */
  readonly mes: number;
  readonly regime: Regime;
  readonly grupos: readonly GrupoDoAcompanhamento[];
  readonly receitaNoMes: ExecucaoDoPeriodo;
  readonly despesaNoMes: ExecucaoDoPeriodo;
  readonly receitaAcumulada: ExecucaoDoPeriodo;
  readonly despesaAcumulada: ExecucaoDoPeriodo;
  /** As categorias estouradas NO MES, ja ordenadas pela diferenca. */
  readonly estouros: readonly LinhaDoAcompanhamento[];
  readonly temPlanejamento: boolean;
}

export interface ValorPlanejado {
  readonly categoriaId: string;
  /** 1 a 12. */
  readonly mes: number;
  readonly valor: Dinheiro;
}

export interface RepositorioOrcamento {
  /** O planejamento gravado do ano, com todas as categorias da empresa. */
  planejamento(escopo: EscopoEmpresa, ano: number): Promise<Planejamento>;
  /** Grava a grade inteira numa transacao. Valor zero apaga a celula. */
  salvarPlanejamento(escopo: EscopoEmpresa, ano: number, valores: readonly ValorPlanejado[], usuarioId: string): Promise<void>;
  /** Planejado x realizado, com o realizado vindo do modulo `dre`. */
  acompanhar(escopo: EscopoEmpresa, ano: number, mes: number, regime: Regime, hoje: DataCivil): Promise<AcompanhamentoDoOrcamento>;
  /** A grade do ano anterior, para servir de base. Nao grava nada. */
  planejadoDoAnoAnterior(escopo: EscopoEmpresa, ano: number): Promise<readonly ValorPlanejado[]>;
  /** O realizado do ano anterior, para servir de base. Nao grava nada. */
  realizadoDoAnoAnterior(escopo: EscopoEmpresa, ano: number, regime: Regime, hoje: DataCivil): Promise<readonly ValorPlanejado[]>;
}
