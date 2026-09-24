import { ARREDONDAMENTO_PADRAO, type Arredondamento, dividirInteirosComArredondamento } from "./arredondamento";
import {
  formatarInteiroEscalado,
  interpretarDecimal,
  normalizarTextoBrasileiro,
  potenciaDeDez,
} from "./numero-decimal";
import { Percentual } from "./percentual";

/** Moedas suportadas. O padrao e BRL; a estrutura permite adicionar outras sem quebrar o dominio. */
export type Moeda = "BRL";

export const MOEDA_PADRAO: Moeda = "BRL";

/** Quantidade de casas decimais por moeda (BRL usa centavos). */
const CASAS_DECIMAIS: Record<Moeda, number> = { BRL: 2 };

/**
 * Valor monetario imutavel.
 *
 * Regras:
 * - Guarda o valor como inteiro na menor unidade (centavos) usando BigInt.
 *   Nunca usa `number` para o valor.
 * - Toda operacao entre dois valores exige a mesma moeda.
 * - Operacoes que podem gerar fracao (percentual, fator, parcelas) recebem a
 *   regra de arredondamento explicitamente; o padrao e "comercial".
 * - Para o banco de dados, use `paraTexto()` -> coluna NUMERIC(15,2).
 *   Para exibir, use `formatarBrasileiro()`.
 *
 * Ver ADR-015 (representacao monetaria).
 */
export class Dinheiro {
  private constructor(
    readonly centavos: bigint,
    readonly moeda: Moeda,
  ) {}

  static deCentavos(centavos: bigint | number, moeda: Moeda = MOEDA_PADRAO): Dinheiro {
    if (typeof centavos === "number") {
      if (!Number.isSafeInteger(centavos)) {
        throw new RangeError(`Centavos precisam ser um inteiro seguro; recebido ${centavos}.`);
      }
      return new Dinheiro(BigInt(centavos), moeda);
    }
    return new Dinheiro(centavos, moeda);
  }

  /** Cria a partir do texto canonico ("1234.56"). E o formato usado pelo banco e pelas APIs. */
  static deTexto(texto: string, moeda: Moeda = MOEDA_PADRAO): Dinheiro {
    const casas = CASAS_DECIMAIS[moeda];
    const { mantissa, escala } = interpretarDecimal(texto);
    if (escala > casas) {
      throw new RangeError(`Valor "${texto}" tem mais casas decimais do que a moeda ${moeda} permite (${casas}).`);
    }
    return new Dinheiro(mantissa * potenciaDeDez(casas - escala), moeda);
  }

  /** Cria a partir de texto digitado pelo usuario no formato brasileiro ("1.234,56", "R$ 10,00"). */
  static deTextoBrasileiro(texto: string, moeda: Moeda = MOEDA_PADRAO): Dinheiro {
    return Dinheiro.deTexto(normalizarTextoBrasileiro(texto), moeda);
  }

  static zero(moeda: Moeda = MOEDA_PADRAO): Dinheiro {
    return new Dinheiro(0n, moeda);
  }

  static somarTodos(valores: readonly Dinheiro[], moeda: Moeda = MOEDA_PADRAO): Dinheiro {
    return valores.reduce((acumulado, atual) => acumulado.somar(atual), Dinheiro.zero(moeda));
  }

  // ---- Operacoes basicas -------------------------------------------------

  somar(outro: Dinheiro): Dinheiro {
    this.exigirMesmaMoeda(outro);
    return new Dinheiro(this.centavos + outro.centavos, this.moeda);
  }

  subtrair(outro: Dinheiro): Dinheiro {
    this.exigirMesmaMoeda(outro);
    return new Dinheiro(this.centavos - outro.centavos, this.moeda);
  }

  negar(): Dinheiro {
    return new Dinheiro(-this.centavos, this.moeda);
  }

  absoluto(): Dinheiro {
    return this.centavos < 0n ? this.negar() : this;
  }

  /** Multiplica por um percentual (ex.: juros de 2% sobre o valor). */
  aplicarPercentual(percentual: Percentual, regra: Arredondamento = ARREDONDAMENTO_PADRAO): Dinheiro {
    const fator = percentual.comoFator();
    const resultado = dividirInteirosComArredondamento(
      this.centavos * fator.mantissa,
      potenciaDeDez(fator.escala),
      regra,
    );
    return new Dinheiro(resultado, this.moeda);
  }

  /** Multiplica por um fator decimal em texto ("1.5", "0.333"). */
  multiplicarPorFator(fator: string, regra: Arredondamento = ARREDONDAMENTO_PADRAO): Dinheiro {
    const { mantissa, escala } = interpretarDecimal(fator);
    const resultado = dividirInteirosComArredondamento(this.centavos * mantissa, potenciaDeDez(escala), regra);
    return new Dinheiro(resultado, this.moeda);
  }

  /** Multiplica por uma quantidade inteira (ex.: 3 unidades). */
  multiplicarPorInteiro(quantidade: bigint | number): Dinheiro {
    const q = typeof quantidade === "number" ? BigInt(quantidade) : quantidade;
    return new Dinheiro(this.centavos * q, this.moeda);
  }

  /**
   * Divide o valor em `quantidade` parcelas cujas somas batem exatamente com o total.
   * A sobra de centavos e distribuida uma a uma nas primeiras parcelas.
   * Exemplo: R$ 100,00 em 3 -> [33,34; 33,33; 33,33].
   */
  dividirEmParcelas(quantidade: number): Dinheiro[] {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new RangeError(`Quantidade de parcelas invalida: ${quantidade}.`);
    }
    const q = BigInt(quantidade);
    const negativo = this.centavos < 0n;
    const total = negativo ? -this.centavos : this.centavos;
    const base = total / q;
    let sobra = total % q;
    const parcelas: Dinheiro[] = [];
    for (let i = 0n; i < q; i++) {
      let valor = base;
      if (sobra > 0n) {
        valor += 1n;
        sobra -= 1n;
      }
      parcelas.push(new Dinheiro(negativo ? -valor : valor, this.moeda));
    }
    return parcelas;
  }

  /** Razao deste valor sobre outro, em percentual (ex.: lucro / receita). */
  percentualSobre(base: Dinheiro): Percentual {
    this.exigirMesmaMoeda(base);
    return Percentual.razao(this.centavos, base.centavos);
  }

  // ---- Comparacoes -------------------------------------------------------

  comparar(outro: Dinheiro): -1 | 0 | 1 {
    this.exigirMesmaMoeda(outro);
    if (this.centavos < outro.centavos) return -1;
    if (this.centavos > outro.centavos) return 1;
    return 0;
  }

  igual(outro: Dinheiro): boolean {
    return this.moeda === outro.moeda && this.centavos === outro.centavos;
  }

  maiorQue(outro: Dinheiro): boolean {
    return this.comparar(outro) === 1;
  }

  menorQue(outro: Dinheiro): boolean {
    return this.comparar(outro) === -1;
  }

  ehZero(): boolean {
    return this.centavos === 0n;
  }

  ehPositivo(): boolean {
    return this.centavos > 0n;
  }

  ehNegativo(): boolean {
    return this.centavos < 0n;
  }

  // ---- Conversoes --------------------------------------------------------

  /** Texto canonico para banco de dados e APIs: "1234.56", "-0.05". */
  paraTexto(): string {
    return formatarInteiroEscalado({ mantissa: this.centavos, escala: CASAS_DECIMAIS[this.moeda] });
  }

  /** Formato para exibicao ao usuario: "R$ 1.234,56", "-R$ 0,05". */
  formatarBrasileiro(): string {
    const casas = CASAS_DECIMAIS[this.moeda];
    const negativo = this.centavos < 0n;
    const absoluto = negativo ? -this.centavos : this.centavos;
    const texto = absoluto.toString().padStart(casas + 1, "0");
    const inteira = texto.slice(0, texto.length - casas);
    const decimal = texto.slice(texto.length - casas);
    const inteiraComPontos = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const simbolo = this.moeda === "BRL" ? "R$" : this.moeda;
    // Espaco INSEPARAVEL (U+00A0) entre o simbolo e o numero, como faz o
    // `Intl` do navegador: com espaco comum, uma coluna estreita quebrava
    // "R$" numa linha e "187,50" na outra. A leitura (`deTextoBrasileiro`)
    // aceita os dois, entao colar um valor copiado da tela continua valendo.
    return `${negativo ? "-" : ""}${simbolo}\u00a0${inteiraComPontos},${decimal}`;
  }

  toJSON(): { valor: string; moeda: Moeda } {
    return { valor: this.paraTexto(), moeda: this.moeda };
  }

  toString(): string {
    return `${this.paraTexto()} ${this.moeda}`;
  }

  private exigirMesmaMoeda(outro: Dinheiro): void {
    if (this.moeda !== outro.moeda) {
      throw new TypeError(`Operacao entre moedas diferentes: ${this.moeda} e ${outro.moeda}.`);
    }
  }
}
