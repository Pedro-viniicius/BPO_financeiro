import type { DataCivil } from "@/compartilhado/datas/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * Porta para integracao com sistemas contabeis (envio de lancamentos ao
 * contador). O produto NAO faz contabilidade oficial; apenas exporta dados
 * gerenciais em um formato que o sistema do contador entende. Adaptadores
 * concretos sao contratados separadamente.
 */
export interface PedidoExportacaoContabil {
  readonly escopo: EscopoEmpresa;
  readonly inicio: DataCivil;
  readonly fim: DataCivil;
}

export interface ResultadoExportacaoContabil {
  readonly nomeArquivo: string;
  readonly tipoConteudo: string;
  readonly conteudo: Uint8Array;
  readonly quantidadeLancamentos: number;
}

export interface ExportadorContabil {
  readonly nome: string;
  exportar(pedido: PedidoExportacaoContabil): Promise<ResultadoExportacaoContabil>;
}
