import type { IdEmpresa } from "@/compartilhado/tipos/identificadores";

/**
 * Prefixos de codigo legivel usados pelo sistema.
 * CP = conta a pagar · CR = conta a receber · DV = divida.
 */
export const PREFIXOS_CODIGO = {
  contaPagar: "CP",
  contaReceber: "CR",
  divida: "DV",
  /** Protocolo de documento capturado por QR code ("DC-2026-000123"). */
  documentoCapturado: "DC",
} as const;

export type PrefixoCodigo = (typeof PREFIXOS_CODIGO)[keyof typeof PREFIXOS_CODIGO];

/**
 * Contrato de geracao de codigos legiveis por humanos ("CP-2026-000123").
 *
 * O codigo legivel e separado do `id` (UUID): o id e tecnico e nunca muda; o
 * codigo e o que o usuario le, informa por telefone e procura na busca.
 *
 * A implementacao precisa ser segura sob concorrencia (ver
 * docs/modelo-dados/concorrencia.md) e deve ser chamada DENTRO da transacao
 * que grava o registro, para que o numero so seja consumido se o registro
 * for realmente gravado.
 */
export interface GeradorCodigo {
  gerarProximo(empresaId: IdEmpresa, prefixo: PrefixoCodigo, ano: number): Promise<string>;
}

/** Monta o texto do codigo: "CP-2026-000123". */
export function formatarCodigo(prefixo: string, ano: number, numero: number): string {
  return `${prefixo}-${ano}-${String(numero).padStart(6, "0")}`;
}
