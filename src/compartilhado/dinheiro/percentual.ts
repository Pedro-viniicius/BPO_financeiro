import { formatarInteiroEscalado, interpretarDecimal, potenciaDeDez } from "./numero-decimal";

/**
 * Percentual com precisao fixa de 4 casas decimais (ex.: 5,2575%).
 *
 * Internamente guarda a mantissa em "milesimos de ponto percentual":
 * 5,25% -> 52500n (5,25 * 10^4). Isso permite calcular juros, descontos e
 * margens sem ponto flutuante.
 */
export class Percentual {
  static readonly ESCALA = 4;

  private constructor(readonly mantissa: bigint) {}

  /** Cria a partir de texto: "5" = 5%, "5.25" = 5,25%. */
  static de(texto: string): Percentual {
    const { mantissa, escala } = interpretarDecimal(texto);
    if (escala > Percentual.ESCALA) {
      throw new RangeError(`Percentual com mais de ${Percentual.ESCALA} casas decimais: "${texto}".`);
    }
    return new Percentual(mantissa * potenciaDeDez(Percentual.ESCALA - escala));
  }

  static zero(): Percentual {
    return new Percentual(0n);
  }

  /**
   * Razao entre duas quantias inteiras (ex.: lucro / receita), em percentual.
   * `numerador / denominador * 100`, arredondado para 4 casas (meio para cima).
   */
  static razao(numerador: bigint, denominador: bigint): Percentual {
    if (denominador === 0n) {
      throw new RangeError("Nao e possivel calcular percentual com denominador zero.");
    }
    const escalado = numerador * 100n * potenciaDeDez(Percentual.ESCALA);
    const negativo = escalado < 0n !== denominador < 0n;
    const n = escalado < 0n ? -escalado : escalado;
    const d = denominador < 0n ? -denominador : denominador;
    const quociente = n / d;
    const resto = n % d;
    const arredondado = resto * 2n >= d ? quociente + 1n : quociente;
    return new Percentual(negativo ? -arredondado : arredondado);
  }

  /** Fator multiplicador como inteiro escalado: 5% -> mantissa 50000n com escala 6 (0,050000). */
  comoFator(): { mantissa: bigint; escala: number } {
    return { mantissa: this.mantissa, escala: Percentual.ESCALA + 2 };
  }

  somar(outro: Percentual): Percentual {
    return new Percentual(this.mantissa + outro.mantissa);
  }

  subtrair(outro: Percentual): Percentual {
    return new Percentual(this.mantissa - outro.mantissa);
  }

  ehNegativo(): boolean {
    return this.mantissa < 0n;
  }

  igual(outro: Percentual): boolean {
    return this.mantissa === outro.mantissa;
  }

  /** Texto canonico com 4 casas: "5.2500". */
  paraTexto(): string {
    return formatarInteiroEscalado({ mantissa: this.mantissa, escala: Percentual.ESCALA });
  }

  /** Formato para exibicao: "5,25%" (remove zeros a direita, mantem ao menos 1 casa). */
  formatarBrasileiro(): string {
    const texto = this.paraTexto();
    const [inteira = "0", decimal = ""] = texto.split(".");
    const decimalAparada = decimal.replace(/0+$/, "");
    const casas = decimalAparada.length === 0 ? "0" : decimalAparada;
    return `${inteira},${casas}%`;
  }

  toJSON(): string {
    return this.paraTexto();
  }
}
