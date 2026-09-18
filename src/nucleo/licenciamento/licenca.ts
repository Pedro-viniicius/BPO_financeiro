import { z } from "zod";

import { RECURSOS, type Recurso } from "./portao-recursos";

/**
 * Formato do arquivo de licenca (`licenca.json`) entregue ao cliente.
 *
 * O arquivo descreve a versao principal licenciada e os recursos contratados.
 * A verificacao de autenticidade (assinatura) sera implementada no Gate 10;
 * a estrutura ja preve o campo. Sem arquivo, a instalacao roda no
 * "modo base" com os recursos da versao 1.x (ver ADR-013) — o produto nunca
 * fica inutilizavel por ausencia de um servico do fornecedor.
 */
export const esquemaLicenca = z.object({
  cliente: z.string().min(1),
  versaoPrincipal: z.number().int().min(1),
  recursos: z.array(z.enum(RECURSOS)),
  emitidaEm: z.string(),
  /** Assinatura digital do conteudo (verificada no Gate 10). */
  assinatura: z.string().optional(),
});

export type Licenca = z.infer<typeof esquemaLicenca>;

export interface LeitorLicenca {
  ler(): Promise<Licenca | null>;
}

export function recursosDaLicenca(licenca: Licenca | null, recursosBase: readonly Recurso[]): ReadonlySet<Recurso> {
  if (!licenca) return new Set(recursosBase);
  return new Set([...recursosBase, ...licenca.recursos]);
}
