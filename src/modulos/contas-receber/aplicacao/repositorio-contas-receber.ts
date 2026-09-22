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
export interface ContaReceberNaLista {
  readonly parcelaId: string;
  readonly tituloId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly clienteNome: string;
  readonly categoriaNome: string;
  readonly dataVencimento: DataVencimento;
  readonly valorOriginal: Dinheiro;
  readonly valorRecebido: Dinheiro;
  readonly saldo: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

/** Um recebimento ja registrado, como o historico mostra. */
export interface RecebimentoRegistrado {
  readonly id: string;
  readonly dataRecebimento: DataCivil;
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  readonly valorRecebido: Dinheiro;
  readonly formaPagamento: string;
  readonly contaBancariaNome: string;
  readonly estornado: boolean;
}

export interface ContaReceberDetalhada extends ContaReceberNaLista {
  readonly clienteId: string;
  readonly categoriaId: string;
  readonly dataCompetencia: DataCivil;
  readonly observacoes: string | null;
  readonly recebimentos: readonly RecebimentoRegistrado[];
}

/** Filtros que o MODELO suporta hoje. Nao ha filtro sem coluna por tras. */
export interface FiltroContasReceber {
  /** Texto livre: casa com descricao, codigo ou nome do cliente. */
  readonly busca?: string;
  readonly situacoes?: readonly SituacaoDerivada[];
  readonly vencimentoDe?: DataVencimento;
  readonly vencimentoAte?: DataVencimento;
  readonly clienteId?: string;
  readonly categoriaId?: string;
}

export interface DadosNovaContaReceber {
  readonly descricao: string;
  readonly clienteId: string;
  readonly categoriaId: string;
  readonly dataVencimento: DataVencimento;
  readonly dataCompetencia: DataCivil;
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosEdicaoContaReceber {
  readonly descricao: string;
  readonly categoriaId: string;
  readonly dataVencimento: DataVencimento;
  /** So aceito enquanto nao houver recebimento; o caso de uso recusa depois. */
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosRecebimento {
  readonly contaBancariaId: string;
  readonly dataRecebimento: DataCivil;
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  readonly formaPagamento: string;
  readonly observacoes?: string;
  /** Para a trilha de auditoria. */
  readonly usuarioId: string;
}

export interface RepositorioContasReceber {
  listar(escopo: EscopoEmpresa, filtro: FiltroContasReceber, paginacao: Paginacao, hoje: DataCivil): Promise<PaginaResultado<ContaReceberNaLista>>;
  buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaReceberDetalhada | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaReceber, usuarioId: string): Promise<{ parcelaId: string }>;
  editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaReceber): Promise<void>;
  /** Grava recebimento + movimentacao bancaria + atualizacao da parcela na MESMA transacao. */
  registrarRecebimento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosRecebimento): Promise<{ recebimentoId: string }>;
}
