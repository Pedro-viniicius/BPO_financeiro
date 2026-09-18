import { Percentual } from "@/compartilhado/dinheiro/indice";

/**
 * Formatacao de percentual para exibicao.
 *
 * O calculo vem do dominio (`Percentual`, que trabalha com inteiros escalados).
 * Aqui nao ha conversao para ponto flutuante: apenas escrita do texto.
 */

/** "5,25%" — zeros a direita sao removidos, mantendo ao menos uma casa. */
export function formatarPercentual(valorCanonico: string): string {
  return Percentual.de(valorCanonico).formatarBrasileiro();
}

/**
 * "+12,5%" / "-3%" — usado em comparacao entre periodos e em orcado x realizado,
 * onde a direcao da variacao e a informacao principal.
 */
export function formatarVariacao(valorCanonico: string): string {
  const percentual = Percentual.de(valorCanonico);
  const texto = percentual.formatarBrasileiro();
  if (percentual.ehNegativo()) return texto;
  if (percentual.igual(Percentual.zero())) return texto;
  return `+${texto}`;
}
