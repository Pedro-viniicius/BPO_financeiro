import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa, PaginaResultado, Paginacao } from "@/compartilhado/tipos/indice";

/**
 * Contas bancarias e o extrato delas.
 *
 * Existe porque pagamento e recebimento EXIGEM conta bancaria e movimentacao
 * (as duas colunas sao NOT NULL no modelo do Gate 3). Sem cadastrar conta,
 * nenhuma baixa pode ser registrada.
 *
 * O que NAO entra agora: conciliacao, importacao de extrato, transferencia e
 * fluxo de caixa. Tudo isso e Gate 6.
 *
 * SALDO NAO E COLUNA (docs/modelo-dados/categorias/bancos.md): e saldo inicial
 * mais o somatorio das movimentacoes. Calcular na leitura evita o erro classico
 * de um saldo materializado sair de sincronia com os lancamentos.
 */

export interface ContaBancariaNaLista {
  readonly id: string;
  readonly nome: string;
  readonly tipo: string;
  readonly instituicaoNome: string | null;
  readonly instituicaoBancariaId: string | null;
  readonly agencia: string | null;
  readonly numeroConta: string | null;
  readonly saldoInicial: Dinheiro;
  readonly dataSaldoInicial: DataCivil;
  readonly saldoAtual: Dinheiro;
  /** Falso enquanto nao houver nenhuma movimentacao: so ai o saldo inicial e editavel. */
  readonly saldoInicialEditavel: boolean;
  readonly ativa: boolean;
}

export interface DadosNovaContaBancaria {
  readonly nome: string;
  readonly tipo: "conta_corrente" | "conta_poupanca" | "conta_pagamento" | "aplicacao" | "caixa";
  readonly instituicaoBancariaId?: string;
  readonly agencia?: string;
  readonly numeroConta?: string;
  readonly saldoInicial: Dinheiro;
  readonly dataSaldoInicial: DataCivil;
}

export interface DadosEdicaoContaBancaria {
  readonly nome: string;
  readonly tipo: "conta_corrente" | "conta_poupanca" | "conta_pagamento" | "aplicacao" | "caixa";
  readonly instituicaoBancariaId?: string;
  readonly agencia?: string;
  readonly numeroConta?: string;
  /** Aceitos SO enquanto a conta nao tiver movimentacao. Depois, a correcao e por ajuste. */
  readonly saldoInicial?: Dinheiro;
  readonly dataSaldoInicial?: DataCivil;
}

/** Uma linha do extrato, com o saldo da conta apos ela. */
export interface LinhaDoExtrato {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly descricao: string;
  readonly origem: string;
  readonly observacoes: string | null;
  /** Saldo da conta depois desta movimentacao. */
  readonly saldoAcumulado: Dinheiro;
  /** Verdadeiro quando esta linha desfaz outra. */
  readonly ehEstorno: boolean;
  /** Estado na conciliacao: conferida com o extrato ou ainda pendente. */
  readonly conciliada: boolean;
}

export interface DadosAjusteDeSaldo {
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly data: DataCivil;
  /** Obrigatorio: um ajuste sem explicacao e um buraco na contabilidade. */
  readonly motivo: string;
  readonly usuarioId: string;
}


/** Uma transferencia entre duas contas da MESMA empresa. */
export interface TransferenciaNaLista {
  readonly id: string;
  readonly data: DataCivil;
  readonly valor: Dinheiro;
  readonly descricao: string | null;
  readonly contaOrigemId: string;
  readonly contaOrigemNome: string;
  readonly contaDestinoId: string;
  readonly contaDestinoNome: string;
  readonly estornada: boolean;
  /** Falso quando ja foi estornada ou quando alguma das duas pontas esta conciliada. */
  readonly podeEstornar: boolean;
}

export interface DadosNovaTransferencia {
  readonly contaOrigemId: string;
  readonly contaDestinoId: string;
  readonly data: DataCivil;
  readonly valor: Dinheiro;
  readonly descricao?: string;
  readonly usuarioId: string;
}

export interface DadosEstornoTransferencia {
  readonly motivo: string;
  readonly dataEstorno: DataCivil;
  readonly usuarioId: string;
}

export interface RepositorioContasBancarias {
  listar(escopo: EscopoEmpresa): Promise<readonly ContaBancariaNaLista[]>;
  buscarPorId(escopo: EscopoEmpresa, id: string): Promise<ContaBancariaNaLista | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaBancaria): Promise<{ contaId: string }>;
  editar(escopo: EscopoEmpresa, id: string, dados: DadosEdicaoContaBancaria): Promise<void>;
  /** Movimentacoes em ordem de data, com o saldo acumulado linha a linha. */
  extrato(escopo: EscopoEmpresa, contaId: string, paginacao: Paginacao): Promise<PaginaResultado<LinhaDoExtrato>>;
  /**
   * Lancamento de ajuste: a forma CERTA de corrigir o saldo de uma conta que
   * ja tem movimentacao. Aparece no extrato, com motivo, em vez de mudar a
   * base do calculo em silencio.
   */
  registrarAjuste(escopo: EscopoEmpresa, contaId: string, dados: DadosAjusteDeSaldo): Promise<{ movimentacaoId: string }>;
  /**
   * Transferencia entre contas proprias: duas movimentacoes vinculadas (saida
   * e entrada) numa unica transacao. Nao e receita nem despesa.
   */
  criarTransferencia(escopo: EscopoEmpresa, dados: DadosNovaTransferencia): Promise<{ transferenciaId: string }>;
  listarTransferencias(escopo: EscopoEmpresa, paginacao: Paginacao): Promise<PaginaResultado<TransferenciaNaLista>>;
  /** Cria as movimentacoes inversas nas DUAS contas. Nada e apagado. */
  estornarTransferencia(escopo: EscopoEmpresa, transferenciaId: string, dados: DadosEstornoTransferencia): Promise<void>;
  listarInstituicoes(): Promise<readonly { id: string; nome: string }[]>;
  /**
   * A lista de instituicoes nasce vazia (a semente do Banco Central ficou para
   * depois). Em vez de travar o cadastro, a propria tela cria a instituicao
   * pelo nome na primeira vez que ela e usada.
   */
  garantirInstituicao(nome: string): Promise<{ instituicaoId: string }>;
}
