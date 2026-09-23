import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * A exportacao completa dos dados.
 *
 * A proposta comercial garante que os dados "podem ser exportados a qualquer
 * momento, inclusive ao fim do piloto". Isso so e verdade se o pacote for
 * suficiente para reconstruir a operacao em outro lugar.
 */
export interface PacoteExportado {
  readonly nome: string;
  readonly conteudo: Buffer;
  /** SHA-256, para conferir que o download chegou inteiro. */
  readonly soma: string;
  readonly resumo: readonly { readonly arquivo: string; readonly linhas: number }[];
}

export interface RepositorioExportacao {
  /** Monta o ZIP inteiro e registra a exportacao na auditoria. */
  exportar(escopo: EscopoEmpresa, usuarioId: string, agora?: Date): Promise<PacoteExportado>;
}
