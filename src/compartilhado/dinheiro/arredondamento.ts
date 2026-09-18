/**
 * Regras de arredondamento usadas em todo o sistema.
 *
 * - "comercial": meio para cima, afastando-se do zero (2,345 -> 2,35; -2,345 -> -2,35).
 *   E o comportamento que usuarios de planilhas e calculadoras esperam e o padrao do produto.
 * - "para-baixo": trunca (2,349 -> 2,34). Usado quando a regra de negocio exige nunca cobrar a mais.
 * - "para-cima": sempre para cima em modulo (2,341 -> 2,35). Raro; existe para completude.
 *
 * Toda operacao que pode gerar fracao de centavo recebe a regra explicitamente
 * ou usa o padrao "comercial". Nao existe arredondamento implicito escondido.
 */
export type Arredondamento = "comercial" | "para-baixo" | "para-cima";

export const ARREDONDAMENTO_PADRAO: Arredondamento = "comercial";

/**
 * Divide `numerador` por `denominador` (ambos inteiros) aplicando a regra de arredondamento.
 * Trabalha apenas com BigInt para nunca perder precisao.
 */
export function dividirInteirosComArredondamento(
  numerador: bigint,
  denominador: bigint,
  regra: Arredondamento = ARREDONDAMENTO_PADRAO,
): bigint {
  if (denominador === 0n) {
    throw new RangeError("Divisao por zero em operacao monetaria.");
  }
  const negativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;

  const quociente = n / d;
  const resto = n % d;

  let resultado: bigint;
  if (resto === 0n) {
    resultado = quociente;
  } else if (regra === "para-baixo") {
    resultado = quociente;
  } else if (regra === "para-cima") {
    resultado = quociente + 1n;
  } else {
    // comercial: compara 2*resto com denominador (resto >= metade -> sobe)
    resultado = resto * 2n >= d ? quociente + 1n : quociente;
  }
  return negativo ? -resultado : resultado;
}
