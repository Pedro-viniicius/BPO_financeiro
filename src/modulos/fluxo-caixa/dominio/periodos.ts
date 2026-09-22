import {
  adicionarDias,
  compararDatas,
  fimDoMes,
  inicioDoMes,
  partesDaData,
  type DataCivil,
} from "@/compartilhado/datas/indice";

/**
 * Os intervalos que o fluxo de caixa mostra.
 *
 * Tudo aqui e aritmetica de calendario pura, e por isso vive no dominio: a
 * virada de periodo e um dos lugares em que um sistema financeiro erra em
 * silencio. Uma semana que comeca no domingo em vez de segunda desloca cada
 * numero da tela sem que nada quebre.
 *
 * Convencoes adotadas, todas visiveis no rotulo para o usuario conferir:
 *   dia     um dia civil;
 *   semana  de SEGUNDA a domingo (norma ISO e o que se usa no Brasil);
 *   mes     do dia 1 ao ultimo dia.
 *
 * A data "hoje" chega de fora, ja calculada no fuso da empresa
 * (`America/Sao_Paulo`). Nada aqui chama `new Date()`: um `Date()` dentro do
 * dominio faria o teste passar de manha e falhar a noite.
 */

export type Granularidade = "dia" | "semana" | "mes";

export const GRANULARIDADES: readonly Granularidade[] = ["dia", "semana", "mes"];

export const NOMES_GRANULARIDADE: Record<Granularidade, string> = {
  dia: "Por dia",
  semana: "Por semana",
  mes: "Por mês",
};

/**
 * O que ja aconteceu, o que ainda vai acontecer, e o periodo que esta no meio.
 *
 * O periodo que contem hoje e QUEBRADO EM DOIS na listagem (ver
 * `gerarPeriodos`): misturar numa linha so o que ja saiu da conta com o que
 * ainda e promessa daria um numero em que ninguem pode confiar para decidir.
 */
export type NaturezaDoPeriodo = "realizado" | "previsto";

export interface IntervaloDoFluxo {
  readonly inicio: DataCivil;
  readonly fim: DataCivil;
  readonly rotulo: string;
  readonly natureza: NaturezaDoPeriodo;
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

function diaDaSemana(data: DataCivil): number {
  const { ano, mes, dia } = partesDaData(data);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Segunda-feira da semana de `data`. Domingo pertence a semana que comecou na segunda anterior. */
export function inicioDaSemana(data: DataCivil): DataCivil {
  const diaDeHoje = diaDaSemana(data);
  const recuo = diaDeHoje === 0 ? 6 : diaDeHoje - 1;
  return adicionarDias(data, -recuo);
}

export function fimDaSemana(data: DataCivil): DataCivil {
  return adicionarDias(inicioDaSemana(data), 6);
}

function inicioDoIntervalo(data: DataCivil, granularidade: Granularidade): DataCivil {
  if (granularidade === "dia") return data;
  if (granularidade === "semana") return inicioDaSemana(data);
  return inicioDoMes(data);
}

function fimDoIntervalo(data: DataCivil, granularidade: Granularidade): DataCivil {
  if (granularidade === "dia") return data;
  if (granularidade === "semana") return fimDaSemana(data);
  return fimDoMes(data);
}

function proximoInicio(inicio: DataCivil, granularidade: Granularidade): DataCivil {
  return adicionarDias(fimDoIntervalo(inicio, granularidade), 1);
}

function formatarBr(data: DataCivil): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function rotularIntervalo(inicio: DataCivil, fim: DataCivil, granularidade: Granularidade): string {
  if (granularidade === "dia") return formatarBr(inicio);
  if (granularidade === "semana") return `${formatarBr(inicio)} a ${formatarBr(fim)}`;
  const { ano, mes } = partesDaData(inicio);
  return `${MESES[mes - 1]} de ${ano}`;
}

/**
 * A lista de intervalos entre duas datas.
 *
 * O intervalo que contem `hoje` vira DOIS: a parte ja realizada (ate hoje) e a
 * parte ainda prevista (de amanha em diante). Se um deles ficar vazio — porque
 * hoje e o primeiro ou o ultimo dia do intervalo — ele simplesmente nao
 * aparece, em vez de virar uma linha zerada sem sentido.
 */
export function gerarPeriodos(
  de: DataCivil,
  ate: DataCivil,
  granularidade: Granularidade,
  hoje: DataCivil,
): readonly IntervaloDoFluxo[] {
  if (compararDatas(de, ate) > 0) return [];

  const periodos: IntervaloDoFluxo[] = [];
  let cursor = inicioDoIntervalo(de, granularidade);
  // Protecao contra intervalo absurdo (ex.: 50 anos por dia) pedido pela URL.
  const LIMITE_DE_LINHAS = 400;

  while (compararDatas(cursor, ate) <= 0 && periodos.length < LIMITE_DE_LINHAS) {
    const inicioBruto = cursor;
    const fimBruto = fimDoIntervalo(cursor, granularidade);
    // O primeiro e o ultimo intervalo sao recortados pelo periodo pedido.
    const inicio = compararDatas(inicioBruto, de) < 0 ? de : inicioBruto;
    const fim = compararDatas(fimBruto, ate) > 0 ? ate : fimBruto;
    const rotulo = rotularIntervalo(inicioBruto, fimBruto, granularidade);

    const todoNoPassado = compararDatas(fim, hoje) <= 0;
    const todoNoFuturo = compararDatas(inicio, hoje) > 0;

    if (todoNoPassado) {
      periodos.push({ inicio, fim, rotulo, natureza: "realizado" });
    } else if (todoNoFuturo) {
      periodos.push({ inicio, fim, rotulo, natureza: "previsto" });
    } else {
      // O intervalo esta no meio: quebra em realizado + previsto.
      periodos.push({ inicio, fim: hoje, rotulo: `${rotulo} · até hoje`, natureza: "realizado" });
      const diaSeguinte = adicionarDias(hoje, 1);
      if (compararDatas(diaSeguinte, fim) <= 0) {
        periodos.push({ inicio: diaSeguinte, fim, rotulo: `${rotulo} · previsto`, natureza: "previsto" });
      }
    }

    cursor = proximoInicio(inicioBruto, granularidade);
  }

  return periodos;
}

/** O intervalo padrao da tela: do inicio do mes passado ao fim do mes que vem. */
export function periodoPadrao(hoje: DataCivil): { de: DataCivil; ate: DataCivil } {
  const mesPassado = adicionarDias(inicioDoMes(hoje), -1);
  const mesQueVem = adicionarDias(fimDoMes(hoje), 1);
  return { de: inicioDoMes(mesPassado), ate: fimDoMes(mesQueVem) };
}
