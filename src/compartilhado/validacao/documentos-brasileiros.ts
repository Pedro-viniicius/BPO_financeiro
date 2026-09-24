/**
 * Validacao de CPF e CNPJ (digitos verificadores).
 * Aceita com ou sem pontuacao. Devolve apenas os digitos quando valido.
 */

function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function calcularDigito(base: string, pesos: readonly number[]): number {
  const soma = base.split("").reduce((acumulado, caractere, indice) => {
    return acumulado + Number(caractere) * (pesos[indice] ?? 0);
  }, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(texto: string): boolean {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 11 || todosIguais(digitos)) return false;
  const primeiro = calcularDigito(digitos.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(digitos.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos[9] === String(primeiro) && digitos[10] === String(segundo);
}

export function validarCnpj(texto: string): boolean {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 14 || todosIguais(digitos)) return false;
  const primeiro = calcularDigito(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(digitos.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos[12] === String(primeiro) && digitos[13] === String(segundo);
}

/** Normaliza para somente digitos; lanca se invalido. */
export function normalizarCpfOuCnpj(texto: string): { tipo: "cpf" | "cnpj"; digitos: string } {
  const digitos = somenteDigitos(texto);
  if (digitos.length === 11 && validarCpf(digitos)) return { tipo: "cpf", digitos };
  if (digitos.length === 14 && validarCnpj(digitos)) return { tipo: "cnpj", digitos };
  throw new SyntaxError("CPF ou CNPJ inválido.");
}

export function formatarCpf(digitos: string): string {
  return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export function formatarCnpj(digitos: string): string {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
