/**
 * Contrato de armazenamento de arquivos (anexos: boletos, notas, comprovantes,
 * extratos importados).
 *
 * Implementacoes possiveis: disco local (Modelos B e C), armazenamento de
 * objetos compativel com S3 (Modelo A). O dominio nunca sabe qual esta em uso.
 *
 * Regras de seguranca (docs/seguranca/modelo-seguranca.md):
 * - tipos permitidos verificados pelo conteudo, nao so pela extensao;
 * - tamanho maximo por arquivo;
 * - nome original nunca usado como caminho no disco.
 */
export interface ArquivoParaGuardar {
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly conteudo: Uint8Array;
}

export interface ArquivoGuardado {
  /** Chave opaca gerada pelo armazenamento. E o que se grava no banco. */
  readonly chave: string;
  readonly tamanhoBytes: number;
  /** Hash SHA-256 do conteudo (deteccao de duplicidade e integridade). */
  readonly impressaoDigital: string;
}

export interface ArmazenamentoArquivos {
  guardar(arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado>;
  obter(chave: string): Promise<Uint8Array | null>;
  remover(chave: string): Promise<void>;
}

export const TIPOS_CONTEUDO_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "text/plain",
  "application/x-ofx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const TAMANHO_MAXIMO_ARQUIVO_BYTES = 15 * 1024 * 1024;
