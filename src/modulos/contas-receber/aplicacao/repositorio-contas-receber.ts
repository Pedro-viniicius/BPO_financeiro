import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { ParcelaPlanejada, SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import type { EscopoEmpresa, PaginaResultado, Paginacao } from "@/compartilhado/tipos/indice";

/**
 * Contrato de acesso a contas a receber.
 *
 * TODO metodo recebe `EscopoEmpresa` como primeiro parametro. Nao existe
 * assinatura sem ele: e o que garante o isolamento entre empresas, ja que a
 * ADR-017 decidiu nao usar seguranca por linha no banco. Um `buscarPorId(id)`
 * sem escopo deixaria a empresa A ler um registro da B sabendo o UUID.
 *
 * DINHEIRO NUNCA E APAGADO. Nao existe `excluirRecebimento`: o que existe e
 * `estornarRecebimento`, que marca a baixa como estornada e cria a movimentacao
 * inversa. Corrigir deixa duas linhas no historico, nunca zero.
 */

/** Uma conta a receber como a lista mostra: titulo + a parcela dela. */
export interface ContaReceberNaLista {
  readonly parcelaId: string;
  readonly tituloId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly clienteNome: string;
  readonly categoriaNome: string;
  readonly numeroParcela: number;
  readonly quantidadeParcelas: number;
  readonly dataVencimento: DataVencimento;
  readonly valorOriginal: Dinheiro;
  readonly valorRecebido: Dinheiro;
  /** O que ainda vai entrar no caixa. Zero quando a parcela foi cancelada. */
  readonly saldo: Dinheiro;
  /** O que deixou de ser recebido por cancelamento. Zero no caso normal. */
  readonly valorCancelado: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

/** Um recebimento ja registrado, como o historico mostra. */
export interface RecebimentoRegistrado {
  readonly id: string;
  readonly dataRecebimento: DataCivil;
  /** Parte em dinheiro: o que de fato entrou referente a divida. */
  readonly valorPrincipal: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  readonly valorDesconto: Dinheiro;
  /** Quanto abateu do saldo da parcela: principal + desconto. */
  readonly valorAbatido: Dinheiro;
  /** Quanto entrou na conta bancaria: principal + juros + multa. */
  readonly valorRecebido: Dinheiro;
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
  readonly valorRecebido: Dinheiro;
  readonly saldo: Dinheiro;
  readonly situacao: SituacaoDerivada;
}

export interface ContaReceberDetalhada extends ContaReceberNaLista {
  readonly clienteId: string;
  readonly categoriaId: string;
  readonly dataCompetencia: DataCivil;
  readonly observacoes: string | null;
  readonly tituloCancelado: boolean;
  readonly motivoCancelamento: string | null;
  /** Ha baixa nao estornada em ALGUMA parcela do titulo. Trava a troca de cliente. */
  readonly tituloTemBaixaAtiva: boolean;
  /** Ha baixa nao estornada NESTA parcela. Trava valor e vencimento. */
  readonly parcelaTemBaixaAtiva: boolean;
  readonly recebimentos: readonly RecebimentoRegistrado[];
  /** Todas as parcelas do titulo, inclusive esta. Uma so quando a conta e a vista. */
  readonly parcelas: readonly ParcelaIrma[];
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
  readonly dataCompetencia: DataCivil;
  /** Soma exata das parcelas; conferida pelo caso de uso antes de chegar aqui. */
  readonly valorTotal: Dinheiro;
  /** Uma parcela quando a conta e a vista; de 2 a 120 quando e parcelada. */
  readonly parcelas: readonly ParcelaPlanejada[];
  readonly observacoes?: string;
}

export interface DadosEdicaoContaReceber {
  readonly descricao: string;
  readonly categoriaId: string;
  /** So aceito enquanto nao houver baixa ativa no titulo. */
  readonly clienteId: string;
  /** So aceitos enquanto nao houver baixa ativa NESTA parcela. */
  readonly dataVencimento: DataVencimento;
  readonly valor: Dinheiro;
  readonly observacoes?: string;
}

export interface DadosRecebimento {
  readonly contaBancariaId: string;
  readonly dataRecebimento: DataCivil;
  /** Parte em dinheiro referente a divida. Entra na conta e abate o saldo. */
  readonly valorPrincipal: Dinheiro;
  /** Entram na conta, NAO abatem o saldo. */
  readonly valorJuros: Dinheiro;
  readonly valorMulta: Dinheiro;
  /** Abate o saldo SEM entrar na conta. */
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

export interface RepositorioContasReceber {
  listar(escopo: EscopoEmpresa, filtro: FiltroContasReceber, paginacao: Paginacao, hoje: DataCivil): Promise<PaginaResultado<ContaReceberNaLista>>;
  buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaReceberDetalhada | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaReceber, usuarioId: string): Promise<{ tituloId: string; parcelaId: string }>;
  editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaReceber, usuarioId: string): Promise<void>;
  /** Grava recebimento + movimentacao bancaria + atualizacao da parcela na MESMA transacao. */
  registrarRecebimento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosRecebimento): Promise<{ recebimentoId: string }>;
  /** Marca a baixa como estornada e cria a movimentacao inversa. Nada e apagado. */
  estornarRecebimento(escopo: EscopoEmpresa, recebimentoId: string, dados: DadosEstorno): Promise<{ parcelaId: string }>;
  /** Cancela o saldo em aberto do titulo. Baixas ja feitas continuam valendo. */
  cancelar(escopo: EscopoEmpresa, tituloId: string, dados: DadosCancelamento): Promise<void>;
}
