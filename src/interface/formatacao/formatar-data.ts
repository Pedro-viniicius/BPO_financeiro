import { type DataCivil, diasEntre, formatarDataBrasileira, partesDaData } from "@/compartilhado/datas/indice";

/**
 * Formatacao de datas para exibicao.
 *
 * A interface nao decide se um titulo esta vencido — isso vem do dominio, na
 * situacao do registro. Aqui apenas escrevemos a distancia entre duas datas em
 * portugues, para que o usuario nao precise contar dias de cabeca.
 */

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** "18/09/2026" — formato padrao de toda data do produto, sempre com 4 digitos de ano. */
export function formatarData(data: DataCivil): string {
  return formatarDataBrasileira(data);
}

/** "sex, 25/09" — usado em listas curtas de vencimento, onde o dia da semana ajuda a planejar. */
export function formatarDataCurtaComDiaDaSemana(data: DataCivil): string {
  const { ano, mes, dia } = partesDaData(data);
  const indice = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  const nome = DIAS_DA_SEMANA[indice] ?? "";
  return `${nome}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** "setembro de 2026" — cabecalho de periodo. */
export function formatarCompetencia(data: DataCivil): string {
  const { ano, mes } = partesDaData(data);
  return `${MESES[mes - 1] ?? ""} de ${ano}`;
}

/**
 * Descreve o prazo de um vencimento em relacao a uma data de referencia.
 * Exemplos: "Vence hoje", "Vence amanhã", "Vence em 5 dias", "Venceu ontem",
 * "Vencido há 8 dias".
 */
export function descreverPrazo(vencimento: DataCivil, referencia: DataCivil): string {
  const dias = diasEntre(referencia, vencimento);
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  if (dias === -1) return "Venceu ontem";
  if (dias > 1) return `Vence em ${dias} dias`;
  return `Vencido há ${Math.abs(dias)} dias`;
}
