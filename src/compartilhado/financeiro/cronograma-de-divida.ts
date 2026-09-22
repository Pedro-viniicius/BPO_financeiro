import { adicionarMeses, type DataVencimento } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";
import { type CategoriaErro, ErroDominio, falha, type Resultado, sucesso } from "../erros/indice";

/**
 * O cronograma de um emprestimo: quanto de cada parcela e juros e quanto e
 * amortizacao.
 *
 * Vive em `compartilhado/` pelo mesmo motivo de `parcelamento.ts`: e
 * aritmetica pura, e a tela de cadastro precisa dela para mostrar a previa com
 * a MESMA conta que o servidor vai gravar. Uma segunda implementacao de Price
 * no navegador daria, mais cedo ou mais tarde, uma parcela na tela e outra na
 * conta a pagar.
 *
 * Essa separacao nao e detalhe contabil — e o que diferencia divida de despesa.
 * Pagar R$ 1.134,71 numa parcela de emprestimo nao empobrece a empresa em
 * R$ 1.134,71: R$ 894,71 apenas trocam de lugar (sai dinheiro, cai a divida) e
 * so R$ 240,00 sao custo de verdade. Somar a parcela inteira como despesa
 * mostraria um prejuizo que nao existe.
 *
 * ----------------------------------------------------------------------
 * OS DOIS SISTEMAS
 *
 *   PRICE  parcela CONSTANTE. Comeca pagando mais juros e menos amortizacao;
 *          a proporcao se inverte ao longo do contrato. E o mais comum em
 *          credito bancario no Brasil.
 *   SAC    amortizacao CONSTANTE. A parcela comeca alta e cai todo mes,
 *          porque os juros incidem sobre um saldo que diminui mais rapido.
 *          Paga-se menos juros no total.
 *
 * ----------------------------------------------------------------------
 * CENTAVOS
 *
 * Nenhum dos dois divide exato. A regra adotada e a mesma do parcelamento do
 * Gate 5.1: a diferenca vai para a ULTIMA parcela, e a soma das amortizacoes
 * bate com o valor contratado ate o centavo. Sem isso, a divida nunca chegaria
 * a zero — ficaria um residuo eterno de alguns centavos que ninguem consegue
 * quitar.
 *
 * Funcoes puras: nada aqui le ou grava nada.
 */

export type SistemaAmortizacao = "price" | "sac" | "outro";

export const SISTEMAS: readonly SistemaAmortizacao[] = ["price", "sac"];

export const NOMES_SISTEMA: Record<SistemaAmortizacao, string> = {
  price: "Price (parcela fixa)",
  sac: "SAC (amortização fixa)",
  outro: "Informado manualmente",
};

export const EXPLICACAO_SISTEMA: Record<SistemaAmortizacao, string> = {
  price: "Todas as parcelas têm o mesmo valor. É o mais comum em crédito bancário.",
  sac: "A parcela começa mais alta e cai todo mês. No total, paga-se menos juros.",
  outro: "Você informa cada parcela, para contratos com regras próprias.",
};

export const MINIMO_PARCELAS_DIVIDA = 1;
export const MAXIMO_PARCELAS_DIVIDA = 480;

export class CronogramaInvalido extends ErroDominio {
  readonly codigo = "cronograma_invalido";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

export interface ParcelaDoCronograma {
  readonly numero: number;
  readonly dataVencimento: DataVencimento;
  readonly valorAmortizacao: Dinheiro;
  readonly valorJuros: Dinheiro;
  readonly valorTotal: Dinheiro;
  /** Quanto ainda se deve DEPOIS desta parcela. */
  readonly saldoDevedor: Dinheiro;
}

export interface PlanoDoEmprestimo {
  readonly valorPrincipal: Dinheiro;
  /** Taxa MENSAL, em pontos percentuais: 2 significa 2% a.m. */
  readonly taxaMensal: number;
  readonly quantidadeParcelas: number;
  readonly primeiroVencimento: DataVencimento;
  readonly sistema: "price" | "sac";
}

/**
 * Converte taxa anual em mensal EQUIVALENTE (juro composto).
 *
 * `(1 + ia)^(1/12) − 1`, nao `ia / 12`. A divisao simples e a conta que os
 * bancos usam para anunciar "2% ao mes = 24% ao ano" quando o efetivo e
 * 26,82%: a diferenca aparece inteira no total pago pelo cliente.
 */
export function taxaAnualParaMensal(taxaAnual: number): number {
  if (taxaAnual === 0) return 0;
  const mensal = (1 + taxaAnual / 100) ** (1 / 12) - 1;
  // Quatro casas: e a precisao da coluna `taxa_juros_mensal` no banco.
  return Math.round(mensal * 1000000) / 10000;
}

export function taxaMensalParaAnual(taxaMensal: number): number {
  if (taxaMensal === 0) return 0;
  const anual = (1 + taxaMensal / 100) ** 12 - 1;
  return Math.round(anual * 1000000) / 10000;
}

/**
 * Gera o cronograma.
 *
 * O saldo devedor e mantido em `Dinheiro` (centavos inteiros) do inicio ao
 * fim: calcular em ponto flutuante acumularia erro parcela a parcela e, num
 * contrato de 48 meses, a divida terminaria alguns centavos longe de zero.
 */
export function gerarCronograma(plano: PlanoDoEmprestimo): readonly ParcelaDoCronograma[] {
  const { valorPrincipal, taxaMensal, quantidadeParcelas, primeiroVencimento, sistema } = plano;

  if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < MINIMO_PARCELAS_DIVIDA || quantidadeParcelas > MAXIMO_PARCELAS_DIVIDA) {
    throw new RangeError(`Quantidade de parcelas invalida: ${quantidadeParcelas}.`);
  }
  if (!valorPrincipal.ehPositivo()) throw new RangeError("O valor contratado precisa ser maior que zero.");
  if (taxaMensal < 0) throw new RangeError("A taxa de juros nao pode ser negativa.");

  const parcelas: ParcelaDoCronograma[] = [];
  const taxa = taxaMensal / 100;
  let saldo = valorPrincipal;

  const parcelaFixa = sistema === "price" ? prestacaoPrice(valorPrincipal, taxa, quantidadeParcelas) : null;
  const amortizacaoFixa =
    sistema === "sac" ? Dinheiro.deCentavos(valorPrincipal.centavos / BigInt(quantidadeParcelas)) : null;

  for (let numero = 1; numero <= quantidadeParcelas; numero++) {
    const ultima = numero === quantidadeParcelas;
    const juros = jurosDoMes(saldo, taxa);

    // Na ultima parcela a amortizacao e EXATAMENTE o saldo que resta: e o que
    // faz a divida fechar em zero e a soma bater com o contratado.
    let amortizacao: Dinheiro;
    if (ultima) {
      amortizacao = saldo;
    } else if (sistema === "price") {
      amortizacao = parcelaFixa!.subtrair(juros);
    } else {
      amortizacao = amortizacaoFixa!;
    }

    // Defesa contra taxa alta demais para o prazo: se os juros comerem a
    // parcela inteira, a divida cresceria em vez de diminuir.
    if (amortizacao.ehNegativo()) amortizacao = Dinheiro.zero();
    if (amortizacao.maiorQue(saldo)) amortizacao = saldo;

    saldo = saldo.subtrair(amortizacao);

    parcelas.push({
      numero,
      dataVencimento: adicionarMeses(primeiroVencimento, numero - 1) as DataVencimento,
      valorAmortizacao: amortizacao,
      valorJuros: juros,
      valorTotal: amortizacao.somar(juros),
      saldoDevedor: saldo,
    });
  }

  return parcelas;
}

/** Juros do mes sobre o saldo, arredondados ao centavo. */
function jurosDoMes(saldo: Dinheiro, taxa: number): Dinheiro {
  if (taxa === 0) return Dinheiro.zero();
  return saldo.multiplicarPorFator(taxa.toFixed(10));
}

/**
 * A prestacao constante do sistema Price.
 *
 *     PMT = PV × i / (1 − (1 + i)^-n)
 *
 * Com taxa zero e a divisao simples — o limite da formula, que de outro modo
 * daria zero sobre zero.
 */
export function prestacaoPrice(valorPrincipal: Dinheiro, taxa: number, parcelas: number): Dinheiro {
  if (taxa === 0) {
    return Dinheiro.deCentavos(valorPrincipal.centavos / BigInt(parcelas));
  }
  const fator = taxa / (1 - (1 + taxa) ** -parcelas);
  return valorPrincipal.multiplicarPorFator(fator.toFixed(10));
}

/**
 * Confere um cronograma antes de grava-lo.
 *
 * Vale para o gerado E para o informado a mao: a previa e editavel, entao o
 * servidor nao pode confiar no que chega. Se a soma das amortizacoes nao bater
 * com o contratado, a divida nunca zera — e o erro so apareceria na ultima
 * parcela, anos depois.
 */
export function validarCronograma(
  parcelas: readonly ParcelaDoCronograma[],
  valorContratado: Dinheiro,
): Resultado<void, CronogramaInvalido> {
  if (parcelas.length < MINIMO_PARCELAS_DIVIDA) {
    return falha(new CronogramaInvalido("O cronograma precisa de pelo menos uma parcela."));
  }
  if (parcelas.length > MAXIMO_PARCELAS_DIVIDA) {
    return falha(new CronogramaInvalido(`O máximo é de ${MAXIMO_PARCELAS_DIVIDA} parcelas.`));
  }

  for (const parcela of parcelas) {
    if (parcela.valorAmortizacao.ehNegativo() || parcela.valorJuros.ehNegativo()) {
      return falha(new CronogramaInvalido(`A parcela ${parcela.numero} tem valor negativo.`, { numero: parcela.numero }));
    }
    if (!parcela.valorTotal.ehPositivo()) {
      return falha(new CronogramaInvalido(`A parcela ${parcela.numero} precisa ter valor maior que zero.`, { numero: parcela.numero }));
    }
    if (!parcela.valorTotal.igual(parcela.valorAmortizacao.somar(parcela.valorJuros))) {
      return falha(
        new CronogramaInvalido(`Na parcela ${parcela.numero}, o total não é a soma de amortização e juros.`, {
          numero: parcela.numero,
        }),
      );
    }
  }

  const somaAmortizacao = Dinheiro.somarTodos(parcelas.map((parcela) => parcela.valorAmortizacao));
  if (!somaAmortizacao.igual(valorContratado)) {
    return falha(
      new CronogramaInvalido(
        `A soma das amortizações (${somaAmortizacao.formatarBrasileiro()}) precisa ser igual ao valor contratado (${valorContratado.formatarBrasileiro()}).`,
        { amortizacao: somaAmortizacao.paraTexto(), contratado: valorContratado.paraTexto() },
      ),
    );
  }

  return sucesso(undefined);
}

/** O total de juros de um cronograma: o custo real do emprestimo. */
export function totalDeJuros(parcelas: readonly ParcelaDoCronograma[]): Dinheiro {
  return Dinheiro.somarTodos(parcelas.map((parcela) => parcela.valorJuros));
}

/** O saldo devedor depois de N parcelas amortizadas. */
export function saldoApos(valorContratado: Dinheiro, amortizacoesPagas: readonly Dinheiro[]): Dinheiro {
  const saldo = valorContratado.subtrair(Dinheiro.somarTodos([...amortizacoesPagas]));
  return saldo.ehNegativo() ? Dinheiro.zero() : saldo;
}
