/**
 * Conversao segura entre texto decimal e inteiros escalados.
 *
 * Um "inteiro escalado" e um par (mantissa, escala) que representa
 * mantissa / 10^escala. Exemplo: "12.345" -> mantissa 12345n, escala 3.
 *
 * Nunca usamos `number` (ponto flutuante) para valores financeiros.
 */
export interface InteiroEscalado {
  readonly mantissa: bigint;
  readonly escala: number;
}

const EXPRESSAO_DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Interpreta um texto no formato canonico ("1234.56", "-0.5", "10").
 * Separador decimal e sempre ponto. Para entrada do usuario em formato
 * brasileiro ("1.234,56"), use `normalizarTextoBrasileiro` antes.
 */
export function interpretarDecimal(texto: string): InteiroEscalado {
  const correspondencia = EXPRESSAO_DECIMAL.exec(texto.trim());
  if (!correspondencia) {
    throw new SyntaxError(`Valor decimal invalido: "${texto}".`);
  }
  const sinal = correspondencia[1] === "-" ? -1n : 1n;
  const parteInteira = correspondencia[2] ?? "0";
  const parteDecimal = correspondencia[3] ?? "";
  const mantissa = sinal * BigInt(parteInteira + parteDecimal);
  return { mantissa, escala: parteDecimal.length };
}

/**
 * Converte "1.234,56" (formato brasileiro) para "1234.56" (formato canonico).
 * Aceita tambem "1234,56" e "R$ 1.234,56".
 */
export function normalizarTextoBrasileiro(texto: string): string {
  return texto
    .replace(/R\$\s*/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
}

export function potenciaDeDez(expoente: number): bigint {
  if (!Number.isInteger(expoente) || expoente < 0) {
    throw new RangeError(`Expoente invalido: ${expoente}.`);
  }
  return 10n ** BigInt(expoente);
}

/** Formata um inteiro escalado como texto canonico com exatamente `escala` casas. */
export function formatarInteiroEscalado(valor: InteiroEscalado): string {
  const negativo = valor.mantissa < 0n;
  const absoluto = negativo ? -valor.mantissa : valor.mantissa;
  const texto = absoluto.toString().padStart(valor.escala + 1, "0");
  const corte = texto.length - valor.escala;
  const inteira = texto.slice(0, corte);
  const decimal = texto.slice(corte);
  const corpo = valor.escala > 0 ? `${inteira}.${decimal}` : inteira;
  return negativo ? `-${corpo}` : corpo;
}
