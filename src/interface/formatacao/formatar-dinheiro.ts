import { Dinheiro } from "@/compartilhado/dinheiro/indice";

/**
 * Formatacao de dinheiro para exibicao.
 *
 * A interface NAO calcula dinheiro: ela recebe o valor ja pronto do dominio,
 * no formato canonico ("1234.56", "-0.05"), e apenas o escreve. Todo o calculo
 * fica em `Dinheiro` (compartilhado) e nos casos de uso. Ver ADR-024.
 */

/** Como o sinal do valor deve aparecer. */
export type EstiloDeSinal =
  /** Apenas o sinal negativo, como em extratos: "R$ 1.200,00" / "-R$ 90,00". */
  | "natural"
  /** Sempre com sinal, para resultados: "+R$ 18.280,00" / "-R$ 3.120,00". */
  | "explicito"
  /** Sem sinal nenhum; quem informa a direcao e o rotulo ao lado. */
  | "ausente";

export type TomDoValor = "positivo" | "negativo" | "neutro";

export interface ValorFormatado {
  /** Texto pronto para exibir, ja em portugues do Brasil. */
  readonly texto: string;
  /** Tom semantico, usado para escolher a cor de REFORCO (nunca o unico sinal). */
  readonly tom: TomDoValor;
  /** Verdadeiro quando o valor e exatamente zero. */
  readonly ehZero: boolean;
}

/**
 * Formata um valor canonico ("1234.56") para exibicao.
 *
 * @param valorCanonico texto no formato do banco/API; NUNCA um numero de ponto flutuante.
 */
export function formatarDinheiro(valorCanonico: string, estiloDeSinal: EstiloDeSinal = "natural"): ValorFormatado {
  const dinheiro = Dinheiro.deTexto(valorCanonico);
  const ehZero = dinheiro.centavos === 0n;
  const ehNegativo = dinheiro.centavos < 0n;
  const absoluto = dinheiro.absoluto().formatarBrasileiro();

  if (estiloDeSinal === "ausente") {
    return { texto: absoluto, tom: tomDoValor(dinheiro.centavos), ehZero };
  }
  if (estiloDeSinal === "explicito" && !ehZero) {
    return { texto: `${ehNegativo ? "-" : "+"}${absoluto}`, tom: tomDoValor(dinheiro.centavos), ehZero };
  }
  return { texto: dinheiro.formatarBrasileiro(), tom: tomDoValor(dinheiro.centavos), ehZero };
}

function tomDoValor(centavos: bigint): TomDoValor {
  if (centavos > 0n) return "positivo";
  if (centavos < 0n) return "negativo";
  return "neutro";
}

/**
 * Texto alternativo para leitores de tela, quando o valor visivel usa sinais
 * graficos. "menos mil e duzentos reais" e pior do que "1.200 reais negativos";
 * escrevemos a forma que o operador financeiro reconhece.
 */
export function descreverValorParaLeitorDeTela(valorCanonico: string): string {
  const dinheiro = Dinheiro.deTexto(valorCanonico);
  const absoluto = dinheiro.absoluto().formatarBrasileiro();
  if (dinheiro.centavos < 0n) return `${absoluto} negativos`;
  return absoluto;
}
