import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { GrupoDre, LinhaDre } from "@/modulos/dre/publico";

/**
 * Gestao do plano de contas: contas, categorias e a ligacao delas com o
 * demonstrativo de resultados.
 *
 * Por que isto virou tela, e nao seed: ate o Gate 8, montar o plano exigia SQL
 * — na verificacao manual do Gate 8 foi preciso inserir as contas a mao. Sem
 * plano nao existe categoria, e sem categoria nao existe conta a pagar nem a
 * receber: uma instalacao nova travava no primeiro lancamento.
 *
 * NADA AQUI APAGA HISTORIA. Categoria usada em um lancamento nao pode ser
 * excluida — o lancamento antigo perderia a classificacao e o demonstrativo do
 * ano passado mudaria sozinho. O caminho e INATIVAR: some dos formularios
 * novos e continua nos registros e relatorios antigos.
 *
 * Como todo repositorio financeiro, recebe `EscopoEmpresa` (ADR-017).
 */

export interface CategoriaDoPlano {
  readonly id: string;
  readonly nome: string;
  readonly ativa: boolean;
  /** Quantos registros ja usam esta categoria (titulos, movimentacoes, dividas, orcamento, recorrencias). */
  readonly usos: number;
  /** Falso quando ha uso: o caminho passa a ser inativar. */
  readonly podeExcluir: boolean;
}

export interface ContaDoPlano {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly grupoDre: GrupoDre;
  readonly ativa: boolean;
  readonly categorias: readonly CategoriaDoPlano[];
  /** Falso quando a conta tem categorias: elas teriam de sair antes. */
  readonly podeExcluir: boolean;
}

export interface GrupoDoPlano {
  readonly grupo: GrupoDre;
  readonly rotulo: string;
  /** Onde os lancamentos deste grupo aparecem no demonstrativo. */
  readonly explicacao: string;
  readonly contas: readonly ContaDoPlano[];
}

export interface PlanoDeContas {
  readonly grupos: readonly GrupoDoPlano[];
  readonly totalContas: number;
  readonly totalCategorias: number;
  /**
   * Linhas do demonstrativo sem NENHUMA categoria ativa.
   *
   * Nao e detalhe: uma linha assim nunca vai receber valor, porque nao ha como
   * classificar um lancamento nela. Ela aparece zerada no Resultados como se
   * realmente nao houvesse nada — e ninguem procura o que nao sabe que falta.
   */
  readonly linhasSemCategoria: readonly { readonly linha: LinhaDre; readonly rotulo: string }[];
  /**
   * Categorias que, por estarem em grupo `transferencia`, ficam FORA do
   * demonstrativo. E o comportamento correto (amortizar divida nao e despesa),
   * mas precisa estar visivel: quem classificar uma despesa aqui por engano
   * nao a encontra em lugar nenhum do Resultados.
   */
  readonly categoriasForaDoResultado: readonly { readonly nome: string; readonly contaNome: string }[];
}

export interface DadosDaConta {
  readonly codigo: string;
  readonly nome: string;
  readonly grupoDre: GrupoDre;
}

export interface DadosDaCategoria {
  readonly nome: string;
  readonly contaPlanoId: string;
}

export interface RepositorioPlanoContas {
  /** A arvore inteira: grupo -> conta -> categoria, com os usos de cada uma. */
  montar(escopo: EscopoEmpresa): Promise<PlanoDeContas>;

  criarConta(escopo: EscopoEmpresa, dados: DadosDaConta, usuarioId: string): Promise<{ contaId: string }>;
  editarConta(escopo: EscopoEmpresa, contaId: string, dados: DadosDaConta, usuarioId: string): Promise<void>;
  /** Inativar nao apaga nada: a conta some dos formularios novos e fica no historico. */
  alterarSituacaoConta(escopo: EscopoEmpresa, contaId: string, ativa: boolean, usuarioId: string): Promise<void>;
  /** So quando a conta nunca recebeu categoria. Caso contrario, `ContaEmUso`. */
  excluirConta(escopo: EscopoEmpresa, contaId: string, usuarioId: string): Promise<void>;

  criarCategoria(escopo: EscopoEmpresa, dados: DadosDaCategoria, usuarioId: string): Promise<{ categoriaId: string }>;
  editarCategoria(escopo: EscopoEmpresa, categoriaId: string, dados: DadosDaCategoria, usuarioId: string): Promise<void>;
  alterarSituacaoCategoria(escopo: EscopoEmpresa, categoriaId: string, ativa: boolean, usuarioId: string): Promise<void>;
  /** So quando a categoria nunca foi usada. Caso contrario, `CategoriaEmUso`. */
  excluirCategoria(escopo: EscopoEmpresa, categoriaId: string, usuarioId: string): Promise<void>;
}
