import { Dinheiro } from "@/compartilhado/dinheiro/indice";

/**
 * A estrutura do demonstrativo de resultados gerencial.
 *
 * Nao e demonstracao contabil oficial (ver LEIA-ME do modulo): e a resposta a
 * "a empresa deu lucro no periodo, e onde?".
 *
 * ----------------------------------------------------------------------
 * DE ONDE VEM CADA LINHA
 *
 * Quase tudo vem do GRUPO da conta do plano (`grupo_dre`), que ja existe no
 * modelo desde o Gate 3. Quatro linhas nao tem grupo proprio porque nao
 * nascem de categoria nenhuma — nascem dos campos da baixa (Gate 5.1):
 *
 *     descontos concedidos   `recebimentos.valor_desconto`
 *     descontos obtidos      `pagamentos.valor_desconto`
 *     juros e multas         somados as linhas financeiras
 *
 * ----------------------------------------------------------------------
 * POR QUE O SINAL NAO E SEMPRE O MESMO
 *
 * Dois grupos precisam olhar o SENTIDO do lancamento, nao so a categoria:
 *
 *   `resultado_financeiro`  entrada e receita financeira (rendimento de
 *                           aplicacao); saida e despesa financeira (tarifa).
 *                           A mesma conta do plano recebe as duas.
 *   `nao_operacional`       pode ser ganho ou perda (venda de um bem).
 *
 * E `receita_bruta` aceita saida: uma devolucao de venda DIMINUI a receita em
 * vez de virar despesa — sem isso, devolver R$ 1.000 apareceria como se a
 * empresa tivesse faturado e gasto, inflando os dois lados.
 *
 * ----------------------------------------------------------------------
 * O QUE FICA DE FORA
 *
 * `transferencia` nunca entra: dinheiro que sai de uma conta propria e entra
 * em outra nao e receita nem despesa. E o grupo onde vive o "Ajuste de saldo"
 * criado no Gate 5.1, que tambem fica de fora por consequencia — ajuste e
 * conserto de base, nao resultado.
 */

/** Os mesmos valores do enum `grupo_dre` do banco. */
export type GrupoDre =
  | "receita_bruta"
  | "deducao"
  | "custo"
  | "despesa_operacional"
  | "resultado_financeiro"
  | "nao_operacional"
  | "transferencia";

/** As linhas do demonstrativo, na ordem em que aparecem. */
export type LinhaDre =
  | "receita_bruta"
  | "deducoes"
  | "descontos_concedidos"
  | "receita_liquida"
  | "custos"
  | "despesas_operacionais"
  | "resultado_operacional"
  | "receitas_financeiras"
  | "despesas_financeiras"
  | "descontos_obtidos"
  | "nao_operacional"
  | "resultado_periodo";

export interface DefinicaoDaLinha {
  readonly linha: LinhaDre;
  readonly rotulo: string;
  /** Subtotais nao tem categorias por baixo: sao contas das linhas anteriores. */
  readonly ehSubtotal: boolean;
  /** Como o valor entra na soma do resultado. Subtotais nao somam (sao calculados). */
  readonly sinal: 1 | -1 | 0;
  /** Nivel de recuo na tela: subtotais ficam alinhados a esquerda. */
  readonly destaque: boolean;
  readonly explicacao: string;
}

export const ESTRUTURA_DRE: readonly DefinicaoDaLinha[] = [
  {
    linha: "receita_bruta",
    rotulo: "Receita bruta",
    ehSubtotal: false,
    sinal: 1,
    destaque: false,
    explicacao: "Tudo o que a empresa faturou, antes de qualquer desconto ou imposto.",
  },
  {
    linha: "deducoes",
    rotulo: "(−) Deduções",
    ehSubtotal: false,
    sinal: -1,
    destaque: false,
    explicacao: "Impostos sobre o faturamento e outras deduções classificadas no plano de contas.",
  },
  {
    linha: "descontos_concedidos",
    rotulo: "(−) Descontos concedidos",
    ehSubtotal: false,
    sinal: -1,
    destaque: false,
    explicacao: "O que foi perdoado ao cliente na hora de receber. Não passou pelo banco.",
  },
  {
    linha: "receita_liquida",
    rotulo: "= Receita líquida",
    ehSubtotal: true,
    sinal: 0,
    destaque: true,
    explicacao: "O que sobrou da receita depois das deduções e dos descontos dados.",
  },
  {
    linha: "custos",
    rotulo: "(−) Custos",
    ehSubtotal: false,
    sinal: -1,
    destaque: false,
    explicacao: "Gastos ligados diretamente ao que é vendido ou prestado.",
  },
  {
    linha: "despesas_operacionais",
    rotulo: "(−) Despesas operacionais",
    ehSubtotal: false,
    sinal: -1,
    destaque: false,
    explicacao: "O custo de manter a operação de pé: pessoal, ocupação, administrativas.",
  },
  {
    linha: "resultado_operacional",
    rotulo: "= Resultado operacional",
    ehSubtotal: true,
    sinal: 0,
    destaque: true,
    explicacao: "O que a atividade-fim gerou, antes do efeito financeiro.",
  },
  {
    linha: "receitas_financeiras",
    rotulo: "(+) Receitas financeiras",
    ehSubtotal: false,
    sinal: 1,
    destaque: false,
    explicacao: "Juros e multas recebidos de clientes, rendimentos de aplicação.",
  },
  {
    linha: "despesas_financeiras",
    rotulo: "(−) Despesas financeiras",
    ehSubtotal: false,
    sinal: -1,
    destaque: false,
    explicacao: "Juros e multas pagos por atraso, tarifas bancárias.",
  },
  {
    linha: "descontos_obtidos",
    rotulo: "(+) Descontos obtidos",
    ehSubtotal: false,
    sinal: 1,
    destaque: false,
    explicacao: "O que o fornecedor perdoou na hora de pagar. Não passou pelo banco.",
  },
  {
    linha: "nao_operacional",
    rotulo: "(+/−) Não operacional",
    ehSubtotal: false,
    sinal: 1,
    destaque: false,
    explicacao: "Ganhos e perdas fora da atividade-fim, como a venda de um bem.",
  },
  {
    linha: "resultado_periodo",
    rotulo: "= Resultado do período",
    ehSubtotal: true,
    sinal: 0,
    destaque: true,
    explicacao: "Lucro quando positivo, prejuízo quando negativo.",
  },
];

/** As linhas que formam cada subtotal. */
export const COMPOSICAO_DOS_SUBTOTAIS: Record<string, readonly LinhaDre[]> = {
  receita_liquida: ["receita_bruta", "deducoes", "descontos_concedidos"],
  resultado_operacional: ["receita_liquida", "custos", "despesas_operacionais"],
  resultado_periodo: [
    "resultado_operacional",
    "receitas_financeiras",
    "despesas_financeiras",
    "descontos_obtidos",
    "nao_operacional",
  ],
};

/**
 * Para qual linha vai um lancamento, dado o grupo do plano e o sentido.
 *
 * Devolve `null` para o que NAO entra no resultado (transferencia entre contas
 * proprias e, por tabela, o ajuste de saldo, que mora nesse grupo).
 */
export function linhaDoLancamento(grupo: GrupoDre | null, tipo: "entrada" | "saida"): LinhaDre | null {
  switch (grupo) {
    case "transferencia":
      return null;
    case "receita_bruta":
      return "receita_bruta";
    case "deducao":
      return "deducoes";
    case "custo":
      return "custos";
    case "despesa_operacional":
      return "despesas_operacionais";
    case "resultado_financeiro":
      return tipo === "entrada" ? "receitas_financeiras" : "despesas_financeiras";
    case "nao_operacional":
      return "nao_operacional";
    /*
     * Sem categoria ou com categoria sem conta do plano. Acontece com dado
     * antigo ou importado. Cai em "nao operacional" em vez de sumir: um valor
     * que desaparece do demonstrativo e pior do que um valor mal classificado,
     * porque ninguem procura o que nao sabe que falta.
     */
    default:
      return "nao_operacional";
  }
}

/**
 * Quanto um lancamento soma NA LINHA dele.
 *
 * Linhas de despesa guardam valores positivos (uma despesa de R$ 100 aparece
 * como "100", e o sinal de menos esta no rotulo). Entao um lancamento de
 * SAIDA numa linha de despesa soma +100; um de ENTRADA na mesma linha (um
 * reembolso) soma −100 e diminui a despesa.
 */
export function contribuicaoNaLinha(linha: LinhaDre, tipo: "entrada" | "saida", valor: Dinheiro): Dinheiro {
  const sinalDaLinha = ESTRUTURA_DRE.find((definicao) => definicao.linha === linha)?.sinal ?? 1;
  // Linha positiva (receita): entrada soma, saida subtrai. Linha negativa
  // (despesa/deducao): saida soma, entrada subtrai.
  const positivo = sinalDaLinha === 1 ? tipo === "entrada" : tipo === "saida";
  return positivo ? valor : valor.negar();
}

/** Calcula os subtotais e o resultado a partir das linhas simples ja somadas. */
export function calcularSubtotais(valores: ReadonlyMap<LinhaDre, Dinheiro>): Map<LinhaDre, Dinheiro> {
  const completo = new Map(valores);
  const ler = (linha: LinhaDre) => completo.get(linha) ?? Dinheiro.zero();

  for (const definicao of ESTRUTURA_DRE) {
    if (!definicao.ehSubtotal) {
      if (!completo.has(definicao.linha)) completo.set(definicao.linha, Dinheiro.zero());
      continue;
    }
    const partes = COMPOSICAO_DOS_SUBTOTAIS[definicao.linha] ?? [];
    let soma = Dinheiro.zero();
    for (const parte of partes) {
      const definicaoDaParte = ESTRUTURA_DRE.find((d) => d.linha === parte);
      // Subtotal entra somando (ele ja carrega o proprio sinal); linha simples
      // entra com o sinal declarado na estrutura.
      const sinal = definicaoDaParte?.ehSubtotal ? 1 : (definicaoDaParte?.sinal ?? 1);
      soma = sinal === 1 ? soma.somar(ler(parte)) : soma.subtrair(ler(parte));
    }
    completo.set(definicao.linha, soma);
  }

  return completo;
}

/**
 * Margem do periodo, em pontos percentuais com duas casas.
 *
 * Sem receita nao ha margem — dividir por zero devolveria `Infinity`, e uma
 * tela que mostra "∞%" perde a confianca de quem le. Devolve `null`, e a tela
 * escreve um travessao.
 */
export function margemPercentual(resultado: Dinheiro, receitaLiquida: Dinheiro): number | null {
  if (receitaLiquida.ehZero()) return null;
  const proporcao = Number(resultado.paraTexto()) / Number(receitaLiquida.paraTexto());
  return Math.round(proporcao * 10000) / 100;
}

/** Variacao percentual entre dois meses. `null` quando o anterior e zero. */
export function variacaoPercentual(atual: Dinheiro, anterior: Dinheiro): number | null {
  if (anterior.ehZero()) return null;
  const base = Math.abs(Number(anterior.paraTexto()));
  const proporcao = (Number(atual.paraTexto()) - Number(anterior.paraTexto())) / base;
  return Math.round(proporcao * 10000) / 100;
}
