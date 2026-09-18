import type { ErroDominio } from "./erro-dominio";

/**
 * Resultado explicito de uma operacao: sucesso com valor ou falha com erro de dominio.
 *
 * Usamos `Resultado` em casos de uso onde a falha e um desfecho esperado
 * (ex.: "conta nao encontrada") e o chamador precisa decidir o que fazer.
 * Excecoes ficam para situacoes realmente inesperadas (banco fora do ar).
 *
 * Uso:
 *   const resultado = await registrarPagamento(...);
 *   if (!resultado.sucesso) { return resultado.erro; }
 *   resultado.valor // tipado
 */
export type Resultado<T, E extends ErroDominio = ErroDominio> =
  | { readonly sucesso: true; readonly valor: T }
  | { readonly sucesso: false; readonly erro: E };

export function sucesso<T>(valor: T): Resultado<T, never> {
  return { sucesso: true, valor };
}

export function falha<E extends ErroDominio>(erro: E): Resultado<never, E> {
  return { sucesso: false, erro };
}

/** Extrai o valor ou lanca o erro. Util em testes e em fluxos onde a falha deve interromper. */
export function desembrulhar<T, E extends ErroDominio>(resultado: Resultado<T, E>): T {
  if (resultado.sucesso) {
    return resultado.valor;
  }
  throw resultado.erro;
}
