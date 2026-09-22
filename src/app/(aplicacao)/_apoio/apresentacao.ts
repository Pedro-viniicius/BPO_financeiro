import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { SituacaoDerivada } from "@/compartilhado/financeiro/indice";

/**
 * Traducao do dominio para a tela. A camada de apresentacao formata; ela nunca
 * decide regra financeira (ADR-024).
 */

/** `2026-10-05` -> `05/10/2026`. A data do dominio NAO muda: so a leitura. */
export function formatarDataBrasileira(data: DataCivil): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarDinheiro(valor: Dinheiro): string {
  return valor.formatarBrasileiro();
}

/** Tom semantico da situacao. Laranja da marca NAO entra aqui: marca nao e semantica. */
export function tomDaSituacao(situacao: SituacaoDerivada): "sucesso" | "perigo" | "atencao" | "neutro" {
  switch (situacao) {
    case "liquidada":
      return "sucesso";
    case "vencida":
      return "perigo";
    case "parcial":
      return "atencao";
    case "cancelada":
    case "aberta":
      return "neutro";
  }
}
