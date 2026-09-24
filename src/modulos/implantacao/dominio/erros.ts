import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Erros de dominio da carga inicial.
 *
 * Existem para que a tela mostre SO o que e de dominio. Antes, qualquer
 * `Error` — inclusive o do PostgreSQL, com nome de tabela e de restricao —
 * chegava a pessoa como mensagem. Um erro do banco e um fato tecnico para o
 * log; o que a pessoa precisa saber e o que fazer a respeito.
 */

export class LoteNaoEncontrado extends ErroDominio {
  readonly codigo = "lote_nao_encontrado";
  readonly categoria: CategoriaErro = "nao_encontrado";

  constructor() {
    super("Lote de importação não encontrado.");
  }
}

export class LoteNaoPodeSerDesfeito extends ErroDominio {
  readonly codigo = "lote_nao_pode_ser_desfeito";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(motivo: string) {
    super(motivo);
  }
}

/**
 * Texto para quando o banco RECUSA apagar um item do lote por chave estrangeira:
 * algo criado DEPOIS da importacao (um titulo lancado a mao para uma pessoa
 * importada, por exemplo) ja aponta para ele. A conferencia previa so enxerga
 * o que o proprio lote criou; esta e a rede de seguranca para o resto.
 */
export const MOTIVO_ITEM_EM_USO =
  "Um cadastro deste lote já é usado por um lançamento feito depois da importação. Remova ou reclassifique esse lançamento antes de desfazer o lote.";
