import { Dinheiro } from "@/compartilhado/dinheiro/indice";

/**
 * A aritmetica de preencher e de acompanhar um orcamento anual.
 *
 * Orcamento e uma grade de CATEGORIA x MES, doze colunas. Preencher isso a mao
 * e o que faz a maioria das empresas desistir de orcar no segundo ano — por
 * isso as quatro formas de preencher rapido (repetir, distribuir, copiar,
 * basear no realizado) sao regra de negocio de verdade, nao conveniencia de
 * interface, e vivem aqui com teste proprio.
 *
 * Tudo sao funcoes puras sobre `Dinheiro`: nada le nem grava nada.
 */

export const MESES_DO_ANO = 12;

/** Um valor por mes, de janeiro a dezembro. */
export type ValoresDoAno = readonly Dinheiro[];

export function anoZerado(): ValoresDoAno {
  return Array.from({ length: MESES_DO_ANO }, () => Dinheiro.zero());
}

/** O mesmo valor nos doze meses. */
export function repetirNosDozeMeses(valor: Dinheiro): ValoresDoAno {
  return Array.from({ length: MESES_DO_ANO }, () => valor);
}

/**
 * Divide um total anual igualmente pelos doze meses.
 *
 * A sobra de centavos vai para a ULTIMA parcela, pela mesma razao do
 * parcelamento do Gate 5.1: a soma dos doze tem de bater com o total ate o
 * centavo, senao o orcado do ano deixa de ser o que foi decidido.
 * R$ 10.000 em 12 -> onze de R$ 833,33 e uma de R$ 833,37.
 */
export function distribuirNoAno(total: Dinheiro): ValoresDoAno {
  const meses = BigInt(MESES_DO_ANO);
  const base = total.centavos / meses;
  const sobra = total.centavos - base * meses;
  return Array.from({ length: MESES_DO_ANO }, (_, indice) =>
    Dinheiro.deCentavos(indice === MESES_DO_ANO - 1 ? base + sobra : base),
  );
}

export function somaDoAno(valores: ValoresDoAno): Dinheiro {
  return Dinheiro.somarTodos([...valores]);
}

/**
 * Aplica um reajuste percentual, usado ao copiar o ano anterior ou ao partir
 * do realizado ("mesma coisa do ano passado, com 8% de inflacao").
 *
 * Zero devolve os mesmos valores; o arredondamento e o comercial do `Dinheiro`.
 */
export function reajustar(valores: ValoresDoAno, percentual: number): ValoresDoAno {
  if (percentual === 0) return valores;
  const fator = (1 + percentual / 100).toFixed(6);
  return valores.map((valor) => valor.multiplicarPorFator(fator));
}

// ------------------------------------------------------- acompanhamento

/**
 * Como a categoria se comporta quando estoura.
 *
 * Nao e a mesma pergunta nos dois lados: gastar MAIS do que o orcado e ruim,
 * faturar MENOS do que o orcado tambem e ruim. Um unico "realizado > planejado
 * = vermelho" marcaria uma receita acima da meta como problema.
 */
export type NaturezaOrcada = "receita" | "despesa";

export interface ExecucaoDoPeriodo {
  readonly planejado: Dinheiro;
  readonly realizado: Dinheiro;
  /** Realizado menos planejado. Positivo significa "mais do que o previsto". */
  readonly diferenca: Dinheiro;
  /** Realizado sobre planejado, em pontos percentuais. `null` sem planejamento. */
  readonly execucao: number | null;
  readonly estourou: boolean;
}

export function compararComOOrcado(
  planejado: Dinheiro,
  realizado: Dinheiro,
  natureza: NaturezaOrcada,
): ExecucaoDoPeriodo {
  const diferenca = realizado.subtrair(planejado);
  return {
    planejado,
    realizado,
    diferenca,
    execucao: percentualDeExecucao(planejado, realizado),
    estourou: estourou(planejado, realizado, natureza),
  };
}

/**
 * Estouro.
 *
 * Despesa: realizado acima do planejado. Receita: realizado abaixo.
 * Sem planejamento nao ha estouro — gastar numa categoria que ninguem orcou e
 * um aviso diferente ("fora do orcamento"), nao um estouro de limite, e
 * chamar os dois pelo mesmo nome faria o usuario parar de olhar.
 */
export function estourou(planejado: Dinheiro, realizado: Dinheiro, natureza: NaturezaOrcada): boolean {
  if (planejado.ehZero()) return false;
  return natureza === "despesa" ? realizado.maiorQue(planejado) : realizado.menorQue(planejado);
}

/** Realizado sobre planejado. `null` quando nao ha o que comparar. */
export function percentualDeExecucao(planejado: Dinheiro, realizado: Dinheiro): number | null {
  if (planejado.ehZero()) return null;
  const proporcao = Number(realizado.paraTexto()) / Number(planejado.paraTexto());
  return Math.round(proporcao * 10000) / 100;
}

/** Quanto da barra de execucao preencher: 0 a 100, com o excedente visivel a parte. */
export function proporcaoDaBarra(execucao: number | null): number {
  if (execucao === null) return 0;
  return Math.max(0, Math.min(100, Math.round(execucao)));
}

/**
 * A natureza de uma categoria, a partir do grupo do plano de contas.
 *
 * Receita bruta e "nao operacional" positivo contam como receita; o resto e
 * despesa. `transferencia` nao se orca — nao e receita nem despesa.
 */
export function naturezaDoGrupo(grupo: string | null): NaturezaOrcada | null {
  switch (grupo) {
    case "receita_bruta":
      return "receita";
    case "deducao":
    case "custo":
    case "despesa_operacional":
    case "resultado_financeiro":
      return "despesa";
    case "nao_operacional":
      return "receita";
    case "transferencia":
      return null;
    default:
      return "despesa";
  }
}
