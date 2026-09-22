import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { ParcelaPlanejada, SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import type { EscopoEmpresa, PaginaResultado, Paginacao } from "@/compartilhado/tipos/indice";

/**
 * Contrato de acesso a contas a pagar.
 *
 * TODO metodo recebe `EscopoEmpresa` como primeiro parametro. Nao existe
 * assinatura sem ele: e o que garante o isolamento entre empresas, ja que a
 * ADR-017 decidiu nao usar seguranca por linha no banco. Um `buscarPorId(id)`
 * sem escopo deixaria a empresa A ler um registro da B sabendo o UUID.
 *
 * DINHEIRO NUNCA E APAGADO. Nao existe `excluirPagamento`: o que existe e
 * `estornarPagamento`, que marca a baixa como estornada e cria a movimentacao
 * inversa. Corrigir deixa duas linhas no historico, nunca zero.
 */

/** Uma conta a pagar como a lista mostra: titulo + a parcela dela. */
export interface ContaPagarNaLista {
  readonly parcelaId: string;
  readonly tituloId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly fornecedorNome: string;
  readonly categoriaNome: string;
  readonly numeroParcela: number;
  readonly quantidadeParcelas: number;
  readonly dataVencimento: DataVencimento;
  readonly valorOriginal: Dinheiro;
  readonly valorPago: Dinheiro;
  /** O que ainda vai sair do caixa. Zero quando a parcela foi cancelada. */
  readonly saldo: Dinheiro;
  /** O que deixou de ser pago por cancelamento. Zero no caso normal. */
  readonly valorCancelado: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

/** Um pagamento ja registrado, como o historico mostra. */
export interface PagamentoRegistrado {
  readonly id: string;
  readonly dataPagamento: DataCivil;
  /** Parte em dinheiro: o que de fato saiu referente a divida. */
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  /** Quanto abateu do saldo da parcela: principal + desconto. */
  readonly valorAbatido: Dinheiro;
  /** Quanto saiu da conta bancaria: principal + juros + multa. */
  readonly valorPago: Dinheiro;
  readonly formaPagamento: string;
  readonly contaBancariaNome: string;
  readonly estornado: boolean;
  readonly estornadoEm: Date | null;
  readonly motivoEstorno: string | null;
  /** Falso quando ja foi estornado ou quando a movimentacao esta conciliada. */
  readonly podeEstornar: boolean;
}

/** Uma parcela irma, mostrada no detalhe de uma conta parcelada. */
export interface ParcelaIrma {
  readonly parcelaId: string;
  readonly numeroParcela: number;
  readonly dataVencimento: DataVencimento;
  readonly valorOriginal: Dinheiro;
  readonly valorPago: Dinheiro;
  readonly saldo: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

export interface ContaPagarDetalhada extends ContaPagarNaLista {
  readonly fornecedorId: string;
  readonly categoriaId: string;
  readonly dataCompetencia: DataCivil;
  readonly observacoes: string | null;
  readonly tituloCancelado: boolean;
  readonly motivoCancelamento: string | null;
  /** Ha baixa nao estornada em ALGUMA parcela do titulo. Trava a troca de fornecedor. */
  readonly tituloTemBaixaAtiva: boolean;
  /** Ha baixa nao estornada NESTA parcela. Trava valor e vencimento. */
  readonly parcelaTemBaixaAtiva: boolean;
  readonly pagamentos: readonly PagamentoRegistrado[];
  /** Todas as parcelas do titulo, inclusive esta. Uma so quando a conta e a vista. */
  readonly parcelas: readonly ParcelaIrma[];
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
  readonly dataCompetencia: DataCivil;
  /** Soma exata das parcelas; conferida pelo caso de uso antes de chegar aqui. */
  readonly valorTotal: Dinheiro;
  /** Uma parcela quando a conta e a vista; de 2 a 120 quando e parcelada. */
  readonly parcelas: readonly ParcelaPlanejada[];
  readonly observacoes?: string;
}

export interface DadosEdicaoContaPagar {
  readonly descricao: string;
  readonly categoriaId: string;
  /** So aceito enquanto nao houver baixa ativa no titulo. */
  readonly fornecedorId: string;
  /** So aceitos enquanto nao houver baixa ativa NESTA parcela. */
  readonly dataVencimento: DataVencimento;
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosPagamento {
  readonly contaBancariaId: string;
  readonly dataPagamento: DataCivil;
  /** Parte em dinheiro referente a divida. Sai da conta e abate o saldo. */
  readonly valorPrincipal: Dinheiro;
  /** Saem da conta, NAO abatem o saldo. */
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  /** Abate o saldo SEM sair da conta. */
  readonly valorDesconto: Dinheiro;
  readonly formaPagamento: string;
  readonly observacoes?: string;
  /** Para a trilha de auditoria. */
  readonly usuarioId: string;
}

export interface DadosEstorno {
  readonly motivo: string;
  readonly dataEstorno: DataCivil;
  readonly usuarioId: string;
}

export interface DadosCancelamento {
  readonly motivo: string;
  readonly usuarioId: string;
}

export interface RepositorioContasPagar {
  listar(escopo: EscopoEmpresa, filtro: FiltroContasPagar, paginacao: Paginacao, hoje: DataCivil): Promise<PaginaResultado<ContaPagarNaLista>>;
  buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaPagarDetalhada | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaPagar, usuarioId: string): Promise<{ tituloId: string; parcelaId: string }>;
  editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaPagar, usuarioId: string): Promise<void>;
  /** Grava pagamento + movimentacao bancaria + atualizacao da parcela na MESMA transacao. */
  registrarPagamento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosPagamento): Promise<{ pagamentoId: string }>;
  /** Marca a baixa como estornada e cria a movimentacao inversa. Nada e apagado. */
  estornarPagamento(escopo: EscopoEmpresa, pagamentoId: string, dados: DadosEstorno): Promise<{ parcelaId: string }>;
  /** Cancela o saldo em aberto do titulo. Baixas ja feitas continuam valendo. */
  cancelar(escopo: EscopoEmpresa, tituloId: string, dados: DadosCancelamento): Promise<void>;
}
