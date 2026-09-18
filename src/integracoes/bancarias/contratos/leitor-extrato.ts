import type { MovimentacaoBancariaExterna } from "./provedor-bancario";

/**
 * Porta para leitura de arquivos de extrato (OFX, CSV, XLSX).
 *
 * Diferente do `ProvedorBancario` (conexao online), o leitor apenas interpreta
 * um arquivo enviado pelo usuario. Ambos produzem `MovimentacaoBancariaExterna`,
 * de modo que a conciliacao nao precisa saber de onde vieram os dados.
 */
export type FormatoExtrato = "ofx" | "csv" | "xlsx";

export interface ExtratoLido {
  readonly formato: FormatoExtrato;
  readonly contaIdentificadorExterno?: string;
  readonly movimentacoes: readonly MovimentacaoBancariaExterna[];
  /** Linhas que nao puderam ser interpretadas, com motivo em portugues. */
  readonly linhasComErro: readonly { linha: number; motivo: string }[];
}

export interface LeitorExtrato {
  readonly formato: FormatoExtrato;
  ler(conteudo: Uint8Array, opcoes?: Record<string, unknown>): Promise<ExtratoLido>;
}
