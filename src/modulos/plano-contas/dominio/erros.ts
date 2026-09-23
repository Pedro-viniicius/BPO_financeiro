import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Erros do plano de contas.
 *
 * Todos existem para dizer NAO a uma exclusao que apagaria historia. A recusa
 * do banco (as chaves estrangeiras sao `RESTRICT`) ja e a garantia; estes
 * erros existem para a pessoa entender o motivo e saber o que fazer — que e
 * quase sempre inativar em vez de excluir.
 */

export class CategoriaEmUso extends ErroDominio {
  readonly codigo = "categoria_em_uso";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(nome: string, usos: number) {
    super(
      `A categoria "${nome}" já está em ${usos} ${usos === 1 ? "lançamento" : "lançamentos"} e não pode ser excluída. ` +
        "Inative-a: ela sai dos formulários novos e continua nos registros e relatórios antigos.",
    );
  }
}

export class ContaEmUso extends ErroDominio {
  readonly codigo = "conta_em_uso";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(nome: string, categorias: number) {
    super(
      `A conta "${nome}" tem ${categorias} ${categorias === 1 ? "categoria" : "categorias"} e não pode ser excluída. ` +
        "Exclua ou mova as categorias primeiro, ou inative a conta.",
    );
  }
}

export class ItemDoPlanoNaoEncontrado extends ErroDominio {
  readonly codigo = "item_do_plano_nao_encontrado";
  readonly categoria: CategoriaErro = "nao_encontrado";

  constructor(o: "conta" | "categoria") {
    super(o === "conta" ? "Conta do plano não encontrada." : "Categoria não encontrada.");
  }
}
