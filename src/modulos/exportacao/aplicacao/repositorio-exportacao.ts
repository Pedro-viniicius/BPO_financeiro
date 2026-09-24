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

/** Um mes de anexos: o que a tela lista e o que vira um ZIP separado (ADR-027). */
export interface ParteDeAnexos {
  /** "AAAA-MM", pelo mes em que o arquivo entrou (fuso de Sao Paulo). */
  readonly mes: string;
  readonly arquivos: number;
  readonly bytes: number;
}

export interface RepositorioExportacao {
  /** Monta o ZIP inteiro e registra a exportacao na auditoria. */
  exportar(escopo: EscopoEmpresa, usuarioId: string, agora?: Date): Promise<PacoteExportado>;
  listarPartesDeAnexos(escopo: EscopoEmpresa): Promise<readonly ParteDeAnexos[]>;
  /** ZIP STORE com os anexos do mes; `obterConteudo` vem da composicao (o modulo nao conhece o disco). */
  exportarAnexosDoMes(
    escopo: EscopoEmpresa,
    mes: string,
    usuarioId: string,
    obterConteudo: (chave: string) => Promise<Uint8Array | null>,
    agora?: Date,
  ): Promise<PacoteExportado>;
}
