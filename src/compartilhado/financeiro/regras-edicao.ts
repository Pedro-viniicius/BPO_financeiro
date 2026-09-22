/**
 * O que ainda pode ser corrigido numa conta, e o que ja nao pode mais.
 *
 * Corrigir um lancamento e normal — quem digita erra. Mas depois que dinheiro
 * se moveu, alguns campos deixam de ser "texto" e passam a ser a explicacao de
 * um valor que saiu ou entrou no banco. Mudar o valor original de uma parcela
 * ja baixada faria o saldo calculado (original - baixado) deixar de bater com
 * a movimentacao real, em silencio, e ninguem descobriria antes da conciliacao.
 *
 * Por isso as regras abaixo sao por NIVEL:
 *
 *   titulo   descricao, categoria, observacao, fornecedor/cliente
 *   parcela  vencimento e valor daquela parcela
 *
 * Uma conta parcelada pode ter a parcela 1 paga e a 5 em aberto: a 5 continua
 * editavel. Quem trava o titulo inteiro e o cancelamento.
 *
 * Cada campo bloqueado tem um MOTIVO em texto. Ele vai para a tela, ao lado do
 * campo — nao em tooltip: dica que so aparece no passar do mouse nao existe no
 * celular e nao e lida por leitor de tela.
 */

export interface EstadoParaEdicao {
  /** O titulo foi cancelado. Nada nele muda mais. */
  readonly cancelado: boolean;
  /** Existe pelo menos uma baixa NAO estornada em alguma parcela do titulo. */
  readonly temBaixaAtiva: boolean;
}

export interface EstadoDaParcelaParaEdicao {
  readonly cancelada: boolean;
  /** Esta parcela especifica tem baixa nao estornada. */
  readonly temBaixaAtiva: boolean;
}

export interface CamposEditaveis {
  /** Descricao, categoria e observacao andam juntas: sao a explicacao do gasto. */
  readonly descricao: boolean;
  /** Fornecedor (a pagar) ou cliente (a receber). */
  readonly pessoa: boolean;
  readonly vencimento: boolean;
  readonly valor: boolean;
}

export const MOTIVO_CANCELADA = "Esta conta foi cancelada. Contas canceladas ficam como estão, para o histórico não mudar depois do fato.";
export const MOTIVO_BAIXA_TITULO =
  "Já existe pagamento registrado nesta conta. Trocar a pessoa mudaria a quem o dinheiro já pago foi destinado.";
export const MOTIVO_BAIXA_PARCELA =
  "Esta parcela já teve baixa. Para alterá-la, estorne a baixa primeiro — assim a correção fica registrada.";

export function camposEditaveis(titulo: EstadoParaEdicao, parcela: EstadoDaParcelaParaEdicao): CamposEditaveis {
  if (titulo.cancelado || parcela.cancelada) {
    return { descricao: false, pessoa: false, vencimento: false, valor: false };
  }
  return {
    descricao: true,
    pessoa: !titulo.temBaixaAtiva,
    // O vencimento de uma parcela AINDA EM ABERTO pode mudar mesmo que outra
    // parcela do mesmo titulo ja tenha sido paga: renegociar a data do que
    // falta e operacao comum.
    vencimento: !parcela.temBaixaAtiva,
    valor: !parcela.temBaixaAtiva,
  };
}

export function motivoDoBloqueio(
  campo: keyof CamposEditaveis,
  titulo: EstadoParaEdicao,
  parcela: EstadoDaParcelaParaEdicao,
): string | null {
  if (camposEditaveis(titulo, parcela)[campo]) return null;
  if (titulo.cancelado || parcela.cancelada) return MOTIVO_CANCELADA;
  if (campo === "pessoa") return MOTIVO_BAIXA_TITULO;
  return MOTIVO_BAIXA_PARCELA;
}

/** Verdadeiro quando ha ao menos um campo editavel — se nao houver, a tela nem abre. */
export function podeEditarAlgo(titulo: EstadoParaEdicao, parcela: EstadoDaParcelaParaEdicao): boolean {
  return Object.values(camposEditaveis(titulo, parcela)).some(Boolean);
}
