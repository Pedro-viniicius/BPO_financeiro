import {
  adicionarMeses,
  compararDatas,
  fimDoMes,
  inicioDoMes,
  partesDaData,
  type DataCivil,
} from "@/compartilhado/datas/indice";

/**
 * O periodo que o demonstrativo cobre, sempre quebrado em MESES.
 *
 * O mes e a unidade do resultado gerencial: e nele que a empresa fecha contas,
 * paga folha e compara com o mes anterior. Trimestre e ano existem como atalho
 * de filtro, nao como coluna — o comparativo continua mensal em todos eles.
 *
 * "Hoje" chega de fora, ja no fuso da empresa. Nada aqui chama `new Date()`:
 * um `Date()` dentro do dominio faria o teste passar de manha e falhar a noite,
 * e faria o mes virar a meia-noite de Londres em vez da de Sao Paulo.
 */

export type AtalhoDePeriodo = "mes_atual" | "mes_anterior" | "trimestre" | "ano" | "personalizado";

export const ATALHOS: readonly AtalhoDePeriodo[] = ["mes_atual", "mes_anterior", "trimestre", "ano", "personalizado"];

export const NOMES_ATALHO: Record<AtalhoDePeriodo, string> = {
  mes_atual: "Mês atual",
  mes_anterior: "Mês anterior",
  trimestre: "Últimos 3 meses",
  ano: "Ano corrente",
  personalizado: "Período personalizado",
};

export type Regime = "caixa" | "competencia";

export const REGIMES: readonly Regime[] = ["caixa", "competencia"];

export const NOMES_REGIME: Record<Regime, string> = {
  caixa: "Caixa",
  competencia: "Competência",
};

export const EXPLICACAO_REGIME: Record<Regime, string> = {
  caixa: "Pelo dinheiro que entrou e saiu de verdade, na data da baixa.",
  competencia: "Pelo mês a que a conta pertence, tenha sido paga ou não.",
};

export interface IntervaloDoResultado {
  readonly de: DataCivil;
  readonly ate: DataCivil;
}

/** O intervalo de cada atalho, ancorado em `hoje`. */
export function intervaloDoAtalho(atalho: AtalhoDePeriodo, hoje: DataCivil): IntervaloDoResultado {
  switch (atalho) {
    case "mes_anterior": {
      const mesPassado = adicionarMeses(hoje, -1);
      return { de: inicioDoMes(mesPassado), ate: fimDoMes(mesPassado) };
    }
    case "trimestre":
      return { de: inicioDoMes(adicionarMeses(hoje, -2)), ate: fimDoMes(hoje) };
    case "ano": {
      const { ano } = partesDaData(hoje);
      return { de: `${ano}-01-01` as DataCivil, ate: `${ano}-12-31` as DataCivil };
    }
    case "mes_atual":
    case "personalizado":
    default:
      return { de: inicioDoMes(hoje), ate: fimDoMes(hoje) };
  }
}

export interface MesDoResultado {
  /** "2026-09". Chave estavel para agrupar. */
  readonly competencia: string;
  readonly inicio: DataCivil;
  readonly fim: DataCivil;
  /** "setembro/2026" */
  readonly rotulo: string;
  /** "set/26" — cabecalho de coluna e rotulo de grafico. */
  readonly rotuloCurto: string;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const ABREVIACOES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** Protege contra um intervalo absurdo vindo da URL (ex.: 200 anos). */
export const MAXIMO_DE_MESES = 36;

export function mesesDoPeriodo(de: DataCivil, ate: DataCivil): readonly MesDoResultado[] {
  if (compararDatas(de, ate) > 0) return [];

  const meses: MesDoResultado[] = [];
  let cursor = inicioDoMes(de);

  while (compararDatas(cursor, ate) <= 0 && meses.length < MAXIMO_DE_MESES) {
    const { ano, mes } = partesDaData(cursor);
    const fimBruto = fimDoMes(cursor);
    meses.push({
      competencia: `${ano}-${String(mes).padStart(2, "0")}`,
      // O primeiro e o ultimo mes sao recortados pelo periodo pedido: pedir
      // "de 10/09 a 20/10" nao pode trazer o mes de setembro inteiro.
      inicio: compararDatas(cursor, de) < 0 ? de : cursor,
      fim: compararDatas(fimBruto, ate) > 0 ? ate : fimBruto,
      rotulo: `${MESES[mes - 1]}/${ano}`,
      rotuloCurto: `${ABREVIACOES[mes - 1]}/${String(ano).slice(2)}`,
    });
    cursor = inicioDoMes(adicionarMeses(cursor, 1));
  }

  return meses;
}
