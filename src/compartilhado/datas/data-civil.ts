/**
 * Data civil: um dia do calendario, sem hora e sem fuso horario.
 *
 * Datas financeiras (vencimento, competencia, pagamento...) sao datas civis.
 * "Vence em 10/03" nao depende do fuso; e o dia 10 de marco onde quer que a
 * empresa esteja. Por isso NAO usamos `Date` (que e um instante com fuso)
 * para representar datas de negocio. Ver docs/arquitetura/banco-dados.md.
 *
 * Representacao: texto "AAAA-MM-DD" (ISO 8601), marcado com um tipo nominal
 * para o TypeScript impedir que um texto qualquer seja usado como data.
 */
export type DataCivil = string & { readonly __tipo: "DataCivil" };

const EXPRESSAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function completarComZero(numero: number, tamanho: number): string {
  return numero.toString().padStart(tamanho, "0");
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Cria uma data civil validando ano, mes (1-12) e dia. */
export function criarDataCivil(ano: number, mes: number, dia: number): DataCivil {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    throw new RangeError("Ano, mes e dia precisam ser inteiros.");
  }
  if (mes < 1 || mes > 12) {
    throw new RangeError(`Mes invalido: ${mes}.`);
  }
  if (dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new RangeError(`Dia invalido: ${dia}/${mes}/${ano}.`);
  }
  return `${completarComZero(ano, 4)}-${completarComZero(mes, 2)}-${completarComZero(dia, 2)}` as DataCivil;
}

/** Interpreta "AAAA-MM-DD". Lanca erro se o texto nao for uma data valida. */
export function dataCivilDeTexto(texto: string): DataCivil {
  const partes = EXPRESSAO_DATA.exec(texto);
  if (!partes) {
    throw new SyntaxError(`Data invalida: "${texto}". Formato esperado: AAAA-MM-DD.`);
  }
  return criarDataCivil(Number(partes[1]), Number(partes[2]), Number(partes[3]));
}

/** Interpreta "DD/MM/AAAA" (formato digitado por usuarios brasileiros). */
export function dataCivilDeTextoBrasileiro(texto: string): DataCivil {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!partes) {
    throw new SyntaxError(`Data invalida: "${texto}". Formato esperado: DD/MM/AAAA.`);
  }
  return criarDataCivil(Number(partes[3]), Number(partes[2]), Number(partes[1]));
}

export function ehDataCivil(texto: string): texto is DataCivil {
  try {
    dataCivilDeTexto(texto);
    return true;
  } catch {
    return false;
  }
}

export function partesDaData(data: DataCivil): { ano: number; mes: number; dia: number } {
  return { ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)), dia: Number(data.slice(8, 10)) };
}

/**
 * Data civil de hoje no fuso horario informado (padrao: America/Sao_Paulo).
 * O fuso importa aqui porque "hoje" para a empresa e o dia no relogio dela,
 * nao o dia em UTC do servidor.
 */
export function hojeDataCivil(fusoHorario = "America/Sao_Paulo", agora: Date = new Date()): DataCivil {
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoHorario,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produz "AAAA-MM-DD"
  return dataCivilDeTexto(formatador.format(agora));
}

function paraDiasDesdeEpoca(data: DataCivil): number {
  const { ano, mes, dia } = partesDaData(data);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86_400_000);
}

function deDiasDesdeEpoca(dias: number): DataCivil {
  const d = new Date(dias * 86_400_000);
  return criarDataCivil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function adicionarDias(data: DataCivil, dias: number): DataCivil {
  return deDiasDesdeEpoca(paraDiasDesdeEpoca(data) + dias);
}

/**
 * Adiciona meses mantendo o dia quando possivel. Se o mes de destino nao tiver
 * o dia (31/01 + 1 mes), usa o ultimo dia do mes (28 ou 29/02).
 * Essa e a regra usada por recorrencias mensais e parcelamentos.
 */
export function adicionarMeses(data: DataCivil, meses: number): DataCivil {
  const { ano, mes, dia } = partesDaData(data);
  const totalMeses = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(totalMeses / 12);
  const novoMes = (totalMeses % 12) + 1;
  const ultimoDia = diasNoMes(novoAno, novoMes);
  return criarDataCivil(novoAno, novoMes, Math.min(dia, ultimoDia));
}

/** Diferenca em dias: positiva se `fim` e depois de `inicio`. */
export function diasEntre(inicio: DataCivil, fim: DataCivil): number {
  return paraDiasDesdeEpoca(fim) - paraDiasDesdeEpoca(inicio);
}

export function compararDatas(a: DataCivil, b: DataCivil): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function ehAnterior(a: DataCivil, b: DataCivil): boolean {
  return a < b;
}

export function ehPosterior(a: DataCivil, b: DataCivil): boolean {
  return a > b;
}

export function inicioDoMes(data: DataCivil): DataCivil {
  const { ano, mes } = partesDaData(data);
  return criarDataCivil(ano, mes, 1);
}

export function fimDoMes(data: DataCivil): DataCivil {
  const { ano, mes } = partesDaData(data);
  return criarDataCivil(ano, mes, diasNoMes(ano, mes));
}

/** Competencia no formato "AAAA-MM" (usado em orcamento e DRE mensal). */
export function competenciaMensal(data: DataCivil): string {
  return data.slice(0, 7);
}

/** Formata para exibicao: "18/09/2026". */
export function formatarDataBrasileira(data: DataCivil): string {
  const { ano, mes, dia } = partesDaData(data);
  return `${completarComZero(dia, 2)}/${completarComZero(mes, 2)}/${ano}`;
}

/**
 * Dia util simples: segunda a sexta. Feriados nacionais/municipais NAO sao
 * considerados aqui; um calendario de feriados sera um servico proprio
 * quando a tesouraria precisar (projecao de recebimento em dia util).
 */
export function ehFimDeSemana(data: DataCivil): boolean {
  const { ano, mes, dia } = partesDaData(data);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}
