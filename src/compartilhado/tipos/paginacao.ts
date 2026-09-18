/** Parametros de paginacao no servidor. Listas financeiras nunca sao carregadas inteiras. */
export interface Paginacao {
  readonly pagina: number;
  readonly tamanho: number;
}

export interface PaginaResultado<T> {
  readonly itens: readonly T[];
  readonly pagina: number;
  readonly tamanho: number;
  readonly total: number;
}

export function deslocamento(paginacao: Paginacao): number {
  return (paginacao.pagina - 1) * paginacao.tamanho;
}
