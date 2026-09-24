import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/** O token ativo de uma empresa, como a tela de configuracao o ve. Nunca inclui o hash. */
export interface TokenDeCapturaAtivo {
  readonly id: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly limiteEnviosHora: number;
}

/** O que a pagina publica recebe ao trocar um token valido por um escopo. */
export interface EscopoResolvidoPorToken {
  readonly escopo: EscopoEmpresa;
  readonly tokenId: string;
  readonly limiteEnviosHora: number;
  readonly nomeEmpresa: string;
}

/**
 * Contrato do repositorio de captura.
 *
 * Todo metodo recebe `EscopoEmpresa` primeiro (ADR-017) — menos UM:
 * `resolverEscopoPorToken`. Ele e a excecao que a ADR-033 descreve: na
 * pagina publica nao ha sessao, e este e o unico lugar do sistema que
 * FABRICA um escopo a partir de um token. Abaixo dele, nenhuma linha sabe
 * que houve token; acima dele, ninguem monta escopo por conta propria.
 */
/** Arquivo ja guardado no armazenamento, pronto para virar linha em `arquivos`. */
export interface NovoArquivo {
  readonly chaveArmazenamento: string;
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly impressaoDigital: string;
}

/**
 * Um anexo do envio: ou um arquivo NOVO, ou um que a empresa ja tinha com o
 * mesmo conteudo (mesmo SHA-256). Reenviar a mesma foto nao duplica nada.
 */
export type ArquivoDoEnvio = { readonly existenteId: string } | { readonly novo: NovoArquivo };

export interface DadosDoEnvio {
  readonly tokenId: string;
  readonly ano: number;
  readonly observacao: string | null;
  readonly arquivos: readonly ArquivoDoEnvio[];
  /** Para a trilha (LGPD): IP ja anonimizado por HMAC, nunca em claro. */
  readonly remetente: { readonly ipAnonimo: string | null; readonly agenteUsuario: string | null };
}

export interface RepositorioCaptura {
  obterTokenAtivo(escopo: EscopoEmpresa): Promise<TokenDeCapturaAtivo | null>;
  /** Arquivo desta empresa com este SHA-256, se ainda tiver conteudo. */
  procurarArquivoPorImpressao(escopo: EscopoEmpresa, impressaoDigital: string): Promise<{ readonly id: string } | null>;
  /** Cria o documento pendente, seus anexos e o evento `documento.recebido`, numa transacao. */
  receberDocumento(escopo: EscopoEmpresa, dados: DadosDoEnvio): Promise<{ readonly id: string; readonly codigo: string }>;
  contarPendentes(escopo: EscopoEmpresa): Promise<number>;
  /** Revoga o token ativo (se houver) e cria o novo, na MESMA transacao: o QR antigo morre no instante em que o novo nasce. */
  gerarToken(
    escopo: EscopoEmpresa,
    dados: { readonly tokenHash: string; readonly autorUsuarioId: string },
  ): Promise<{ readonly id: string; readonly substituiuAnterior: boolean }>;
  /** Verdadeiro se havia token ativo para revogar. */
  revogarToken(escopo: EscopoEmpresa, dados: { readonly autorUsuarioId: string }): Promise<boolean>;
  resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null>;
}
