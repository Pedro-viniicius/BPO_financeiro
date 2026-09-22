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

/**
 * As categorias que podem classificar uma conta a pagar ou a receber.
 *
 * O grupo `transferencia` fica de fora: por definicao do proprio modelo, ele
 * "nao entra na DRE". E onde vivem coisas como o "Ajuste de saldo" — conserto
 * de base, nao despesa nem receita. Oferece-lo na lista de uma conta a pagar
 * criaria um gasto que nunca apareceria no resultado, e ninguem descobriria
 * isso ate fechar o mes.
 */
export function categoriasQueClassificamContas<T extends { grupoDre: string }>(categorias: readonly T[]): readonly T[] {
  return categorias.filter((categoria) => categoria.grupoDre !== "transferencia");
}
