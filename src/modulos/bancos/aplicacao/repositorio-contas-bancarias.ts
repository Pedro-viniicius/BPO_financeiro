import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * Contas bancarias — o minimo que o Gate 5 precisa.
 *
 * Existe aqui porque pagamento e recebimento EXIGEM conta bancaria e
 * movimentacao (as duas colunas sao NOT NULL no modelo do Gate 3). Sem
 * cadastrar conta, nenhuma baixa pode ser registrada.
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
  readonly agencia: string | null;
  readonly numeroConta: string | null;
  readonly saldoAtual: Dinheiro;
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

export interface RepositorioContasBancarias {
  listar(escopo: EscopoEmpresa): Promise<readonly ContaBancariaNaLista[]>;
  buscarPorId(escopo: EscopoEmpresa, id: string): Promise<ContaBancariaNaLista | null>;
  criar(escopo: EscopoEmpresa, dados: DadosNovaContaBancaria): Promise<{ contaId: string }>;
  editar(escopo: EscopoEmpresa, id: string, dados: Omit<DadosNovaContaBancaria, "saldoInicial" | "dataSaldoInicial">): Promise<void>;
  listarInstituicoes(): Promise<readonly { id: string; nome: string }[]>;
  /**
   * A lista de instituicoes nasce vazia (a semente do Banco Central ficou para
   * depois). Em vez de travar o cadastro, a propria tela cria a instituicao
   * pelo nome na primeira vez que ela e usada.
   */
  garantirInstituicao(nome: string): Promise<{ instituicaoId: string }>;
}
