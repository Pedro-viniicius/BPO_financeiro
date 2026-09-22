import { type CategoriaErro, ErroDominio, RegistroNaoEncontrado } from "@/compartilhado/erros/indice";

export class ContaReceberNaoEncontrada extends RegistroNaoEncontrado {
  readonly codigo = "conta_receber_nao_encontrada";

  constructor(id: string) {
    super("Conta a receber não encontrada.", { id });
  }
}

export class ContaReceberJaCancelada extends ErroDominio {
  readonly codigo = "conta_receber_ja_cancelada";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(id: string) {
    super("Esta conta já foi cancelada e não pode ser alterada.", { id });
  }
}

/** Mesma regra de contas a pagar: depois da baixa, o valor original vira historia. */
export class EdicaoBloqueadaPorRecebimento extends ErroDominio {
  readonly codigo = "edicao_bloqueada_por_recebimento";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("Esta conta já tem recebimento registrado: o valor original não pode mais ser alterado.");
  }
}
