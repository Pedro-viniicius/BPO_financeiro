import type { TomSemantico } from "@/interface/componentes/indice";
import type { SituacaoDocumento } from "@/modulos/captura-documentos/publico";

export const TOM_DA_SITUACAO: Record<SituacaoDocumento, TomSemantico> = {
  pendente_conferencia: "atencao",
  aprovado: "sucesso",
  rejeitado: "perigo",
  arquivado_sem_conferencia: "neutro",
};

export const FORMATO_INSTANTE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
