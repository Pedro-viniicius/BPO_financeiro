import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import type { EscopoEmpresa, PaginaResultado, Paginacao } from "@/compartilhado/tipos/indice";

/**
 * Contrato de acesso a contas a pagar.
 *
 * TODO metodo recebe `EscopoEmpresa` como primeiro parametro. Nao existe
 * assinatura sem ele: e o que garante o isolamento entre empresas, ja que a
 * ADR-017 decidiu nao usar seguranca por linha no banco. Um `buscarPorId(id)`
 * sem escopo deixaria a empresa A ler um registro da B sabendo o UUID.
 */

/** Uma conta a pagar como a lista mostra: titulo + a parcela dela. */
export interface ContaPagarNaLista {
  readonly parcelaId: string;
  readonly tituloId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly fornecedorNome: string;
  readonly categoriaNome: string;
  readonly dataVencimento: DataVencimento;
  readonly valorOriginal: Dinheiro;
  readonly valorPago: Dinheiro;
  readonly saldo: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

/** Um pagamento ja registrado, como o historico mostra. */
export interface PagamentoRegistrado {
  readonly id: string;
  readonly dataPagamento: DataCivil;
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  readonly valorPago: Dinheiro;
  readonly formaPagamento: string;
  readonly contaBancariaNome: string;
  readonly estornado: boolean;
}

export interface ContaPagarDetalhada extends ContaPagarNaLista {
  readonly fornecedorId: string;
  readonly categoriaId: string;
  readonly dataCompetencia: DataCivil;
  readonly observacoes: string | null;
  readonly pagamentos: readonly PagamentoRegistrado[];
}

/** Filtros que o MODELO suporta hoje. Nao ha filtro sem coluna por tras. */
export interface FiltroContasPagar {
  /** Texto livre: casa com descricao, codigo ou nome do fornecedor. */
  readonly busca?: string;
  readonly situacoes?: readonly SituacaoDerivada[];
  readonly vencimentoDe?: DataVencimento;
  readonly vencimentoAte?: DataVencimento;
  readonly fornecedorId?: string;
  readonly categoriaId?: string;
}

export interface DadosNovaContaPagar {
  readonly descricao: string;
  readonly fornecedorId: string;
  readonly categoriaId: string;
  readonly dataVencimento: DataVencimento;
  readonly dataCompetencia: DataCivil;
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosEdicaoContaPagar {
  readonly descricao: string;
  readonly categoriaId: string;
  readonly dataVencimento: DataVencimento;
  /** So aceito enquanto nao houver pagamento; o caso de uso recusa depois. */
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosPagamento {
  readonly contaBancariaId: string;
  readonly dataPagamento: DataCivil;
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  readonly formaPagamento: string;
  readonly observacoes?: string;
  /** Para a trilha de auditoria. */
  readonly usuarioId: string;
}

export interface RepositorioContasPagar {
  listar(escopo: EscopoEmpresa, filtro: FiltroContasPagar, paginacao: Paginacao, hoje: DataCivil): Promise<PaginaResultado<ContaPagarNaLista>>;
  buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaPagarDetalhada | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaPagar, usuarioId: string): Promise<{ parcelaId: string }>;
  editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaPagar): Promise<void>;
  /** Grava pagamento + movimentacao bancaria + atualizacao da parcela na MESMA transacao. */
  registrarPagamento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosPagamento): Promise<{ pagamentoId: string }>;
}
