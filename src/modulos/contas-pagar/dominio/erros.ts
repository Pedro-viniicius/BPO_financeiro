import { type CategoriaErro, ErroDominio, RegistroNaoEncontrado } from "@/compartilhado/erros/indice";

export class ContaPagarNaoEncontrada extends RegistroNaoEncontrado {
  readonly codigo = "conta_pagar_nao_encontrada";

  constructor(id: string) {
    super("Conta a pagar nao encontrada.", { id });
  }
}

export class PagamentoJaRegistrado extends ErroDominio {
  readonly codigo = "pagamento_ja_registrado";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(id: string) {
    super("Esta conta ja esta marcada como paga.", { id });
  }
}

export class ContaPagarJaCancelada extends ErroDominio {
  readonly codigo = "conta_pagar_ja_cancelada";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(id: string) {
    super("Esta conta ja foi cancelada e nao pode ser alterada.", { id });
  }
}

export class TransicaoSituacaoInvalida extends ErroDominio {
  readonly codigo = "transicao_situacao_invalida";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(de: string, para: string) {
    super("Esta acao nao e possivel na situacao atual da conta.", { de, para });
  }
}

export class AprovacaoPeloProprioAutor extends ErroDominio {
  readonly codigo = "aprovacao_pelo_proprio_autor";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("Quem registrou a conta nao pode aprova-la. Outra pessoa precisa aprovar.");
  }
}

/**
 * Depois de existir pagamento, o valor original e a existencia da conta viram
 * historia: mexer neles faria o saldo ja calculado deixar de bater com o
 * dinheiro que saiu da conta bancaria. Descricao, categoria e vencimento
 * continuam editaveis — eles nao alteram a aritmetica.
 */
export class EdicaoBloqueadaPorPagamento extends ErroDominio {
  readonly codigo = "edicao_bloqueada_por_pagamento";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("Esta conta já tem pagamento registrado: o valor original não pode mais ser alterado.");
  }
}
