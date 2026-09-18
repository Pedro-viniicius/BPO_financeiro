/**
 * Contexto financeiro entregue a inteligencia artificial.
 *
 * E um resumo JA CALCULADO pelo sistema (motor de calculo dos modulos),
 * agregado e sem dados pessoais. A IA nunca recebe tabelas operacionais,
 * nomes de funcionarios, dados bancarios ou o esquema do banco.
 *
 * Cada bloco corresponde a uma "consulta permitida" (ver
 * docs/arquitetura/inteligencia-artificial.md). Todos sao opcionais: o
 * montador inclui apenas o necessario para a pergunta.
 */
export interface ResumoCaixaIA {
  readonly saldoDisponivel: string;
  readonly entradasPrevistas30Dias: string;
  readonly saidasPrevistas30Dias: string;
  readonly saldoProjetado30Dias: string;
  readonly diaProjetadoNegativo?: string;
  readonly valorProjetadoNegativo?: string;
}

export interface ResumoContasIA {
  readonly totalEmAberto: string;
  readonly totalVencido: string;
  readonly quantidadeVencidas: number;
  readonly prazoMedioDias: number;
}

export interface LinhaDreIA {
  readonly linha: string;
  readonly valor: string;
  readonly percentualReceitaLiquida: string;
}

export interface VariacaoOrcamentoIA {
  readonly categoria: string;
  readonly planejado: string;
  readonly realizado: string;
  readonly variacaoValor: string;
  readonly variacaoPercentual: string;
  readonly favoravel: boolean;
}

export interface ContextoFinanceiro {
  readonly empresa: { readonly nomeFantasia: string; readonly segmento?: string };
  readonly periodo: { readonly inicio: string; readonly fim: string };
  readonly moeda: "BRL";
  readonly caixa?: ResumoCaixaIA;
  readonly contasReceber?: ResumoContasIA;
  readonly contasPagar?: ResumoContasIA;
  readonly dreMensal?: readonly LinhaDreIA[];
  readonly variacaoOrcamento?: readonly VariacaoOrcamentoIA[];
  readonly capitalGiro?: {
    readonly prazoMedioRecebimentoDias: number;
    readonly prazoMedioPagamentoDias: number;
    readonly necessidadeCapitalGiro: string;
  };
  /** Pontos de atencao gerados por regra deterministica, para a IA explicar. */
  readonly pontosAtencao?: readonly string[];
}
