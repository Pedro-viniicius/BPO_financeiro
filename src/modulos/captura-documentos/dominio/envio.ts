import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";
import { TAMANHO_MAXIMO_ARQUIVO_BYTES } from "@/nucleo/arquivos/publico";

/**
 * Regras de um ENVIO pela pagina publica: quantos arquivos, de que tamanho,
 * de que tipo, e quanto texto livre.
 *
 * Os numeros sao decisao de produto, nao limite tecnico:
 * - 10 arquivos: uma nota de varias paginas mais o boleto. Mais que isso e
 *   lote, e lote entra pela implantacao, nao pela foto no balcao;
 * - 40 MB por envio: cinco fotos de celular sem compressao. O limite por
 *   arquivo (15 MB) e o mesmo do resto do sistema, para nao haver duas
 *   verdades;
 * - 500 caracteres de observacao: e um recado ("nota do fornecedor X, ref.
 *   pedido 123"), nao um formulario.
 */
export const MAXIMO_ARQUIVOS_POR_ENVIO = 10;
export const TAMANHO_MAXIMO_ENVIO_BYTES = 40 * 1024 * 1024;
export const TAMANHO_MAXIMO_OBSERVACAO = 500;

/** Os tres tipos que a pagina publica aceita. Conferidos pelo CONTEUDO (ADR-032), nunca so pelo nome. */
export const TIPOS_ACEITOS_NA_CAPTURA = ["image/jpeg", "image/png", "application/pdf"] as const;
export type TipoAceitoNaCaptura = (typeof TIPOS_ACEITOS_NA_CAPTURA)[number];

export type MotivoRecusa =
  | "sem_arquivos"
  | "arquivos_demais"
  | "arquivo_grande"
  | "envio_grande"
  | "tipo_nao_permitido"
  | "observacao_longa"
  | "limite_excedido";

/** Mensagens para quem enviou: dizem O QUE fazer, nao o que deu errado por dentro. */
export const MENSAGENS_DE_RECUSA: Record<MotivoRecusa, string> = {
  sem_arquivos: "Escolha ao menos uma foto ou arquivo.",
  arquivos_demais: `Envie no máximo ${MAXIMO_ARQUIVOS_POR_ENVIO} arquivos de uma vez.`,
  arquivo_grande: "Um dos arquivos tem mais de 15 MB. Tire a foto de novo com menos resolução, ou envie em partes.",
  envio_grande: "O envio passou de 40 MB. Envie menos arquivos de uma vez.",
  tipo_nao_permitido: "Só são aceitos JPG, PNG e PDF.",
  observacao_longa: `A observação pode ter no máximo ${TAMANHO_MAXIMO_OBSERVACAO} caracteres.`,
  limite_excedido: "Muitos envios na última hora para esta empresa. Aguarde um pouco e tente de novo.",
};

export class EnvioRecusado extends ErroDominio {
  readonly codigo = "envio_recusado";
  readonly categoria: CategoriaErro = "validacao";

  constructor(readonly motivo: MotivoRecusa) {
    super(MENSAGENS_DE_RECUSA[motivo]);
  }
}

export interface ArquivoParaValidar {
  readonly tamanhoBytes: number;
  readonly tipoConteudo: string;
}

export function ehTipoAceito(tipo: string): tipo is TipoAceitoNaCaptura {
  return (TIPOS_ACEITOS_NA_CAPTURA as readonly string[]).includes(tipo);
}

/** Lanca `EnvioRecusado` no primeiro problema, na ordem em que a pessoa consegue corrigir. */
export function validarEnvio(arquivos: readonly ArquivoParaValidar[], observacao: string | null): void {
  if (arquivos.length === 0) throw new EnvioRecusado("sem_arquivos");
  if (arquivos.length > MAXIMO_ARQUIVOS_POR_ENVIO) throw new EnvioRecusado("arquivos_demais");
  let total = 0;
  for (const arquivo of arquivos) {
    if (!ehTipoAceito(arquivo.tipoConteudo)) throw new EnvioRecusado("tipo_nao_permitido");
    if (arquivo.tamanhoBytes > TAMANHO_MAXIMO_ARQUIVO_BYTES) throw new EnvioRecusado("arquivo_grande");
    total += arquivo.tamanhoBytes;
  }
  if (total > TAMANHO_MAXIMO_ENVIO_BYTES) throw new EnvioRecusado("envio_grande");
  if (observacao !== null && observacao.length > TAMANHO_MAXIMO_OBSERVACAO) throw new EnvioRecusado("observacao_longa");
}

/** Formato do protocolo que a confirmacao mostra. So isto volta para a tela publica. */
export const FORMATO_PROTOCOLO = /^DC-\d{4}-\d{6}$/;
