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
