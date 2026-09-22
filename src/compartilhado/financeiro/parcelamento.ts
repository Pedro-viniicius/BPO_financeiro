import { adicionarDias, adicionarMeses, type DataVencimento } from "../datas/indice";
import { Dinheiro } from "../dinheiro/indice";
import { type CategoriaErro, ErroDominio } from "../erros/erro-dominio";
import { falha, type Resultado, sucesso } from "../erros/resultado";

/**
 * A aritmetica do parcelamento: de um total e um numero de vezes, quais
 * parcelas nascem.
 *
 * Vive em `compartilhado/` pelo mesmo motivo de `baixa-de-parcela.ts`: pagar e
 * receber parcelam exatamente igual.
 *
 * Duas regras merecem atencao porque sao onde parcelamento costuma errar:
 *
 * 1. CENTAVOS. R$ 1.000,00 em 3 nao divide. Alguem precisa levar o centavo que
 *    sobra, e a soma das parcelas tem de bater com o total ate o ultimo
 *    centavo — senao o titulo devolve um valor e as parcelas, outro. Aqui a
 *    sobra vai para a ULTIMA parcela: a primeira e a que o cliente ve primeiro
 *    e confere contra o combinado, e a ultima e a de ajuste.
 *    (`Dinheiro.dividirEmParcelas` poe a sobra nas primeiras; por isso nao e
 *    usado aqui.)
 *
 * 2. DIA QUE NAO EXISTE. Vencimento 31/01 parcelado em 3 nao tem 31/02.
 *    `adicionarMeses` ja resolve caindo no ultimo dia do mes (28, 29 ou 30) —
 *    e o mes seguinte volta para o dia 31, em vez de arrastar o erro adiante.
 */

export const MINIMO_PARCELAS = 2;
export const MAXIMO_PARCELAS = 120;

/** Os mesmos valores do enum `frequencia_recorrencia` do banco. */
export type Periodicidade = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export const PERIODICIDADES: readonly Periodicidade[] = [
  "semanal",
  "quinzenal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
];

export const NOMES_PERIODICIDADE: Record<Periodicidade, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "A cada 2 meses",
  trimestral: "A cada 3 meses",
  semestral: "A cada 6 meses",
  anual: "Anual",
};

/** Uma parcela antes de existir no banco: a previa que o usuario confere e pode ajustar. */
export interface ParcelaPlanejada {
  readonly numero: number;
  readonly dataVencimento: DataVencimento;
  readonly valor: Dinheiro;
}

export class PlanoDeParcelasInvalido extends ErroDominio {
  readonly codigo = "plano_de_parcelas_invalido";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

/** Avanca o vencimento da parcela `indice` (0 = a primeira, que nao anda). */
function vencimentoDaParcela(primeiro: DataVencimento, periodicidade: Periodicidade, indice: number): DataVencimento {
  switch (periodicidade) {
    case "semanal":
      return adicionarDias(primeiro, 7 * indice) as DataVencimento;
    case "quinzenal":
      return adicionarDias(primeiro, 14 * indice) as DataVencimento;
    case "mensal":
      return adicionarMeses(primeiro, indice) as DataVencimento;
    case "bimestral":
      return adicionarMeses(primeiro, 2 * indice) as DataVencimento;
    case "trimestral":
      return adicionarMeses(primeiro, 3 * indice) as DataVencimento;
    case "semestral":
      return adicionarMeses(primeiro, 6 * indice) as DataVencimento;
    case "anual":
      return adicionarMeses(primeiro, 12 * indice) as DataVencimento;
  }
}

export interface PlanoDeParcelamento {
  readonly quantidade: number;
  readonly total: Dinheiro;
  readonly primeiroVencimento: DataVencimento;
  readonly periodicidade: Periodicidade;
}

/**
 * A previa das parcelas. Nada e gravado: e so o calculo que a tela mostra para
 * o usuario conferir (e ajustar) antes de salvar.
 */
export function gerarParcelas(plano: PlanoDeParcelamento): readonly ParcelaPlanejada[] {
  if (!Number.isInteger(plano.quantidade) || plano.quantidade < 1) {
    throw new RangeError(`Quantidade de parcelas invalida: ${plano.quantidade}.`);
  }
  if (!plano.total.ehPositivo()) {
    throw new RangeError("O total precisa ser maior que zero.");
  }

  const quantidade = BigInt(plano.quantidade);
  const base = plano.total.centavos / quantidade;
  const sobra = plano.total.centavos - base * quantidade;

  const parcelas: ParcelaPlanejada[] = [];
  for (let i = 0; i < plano.quantidade; i++) {
    const ultima = i === plano.quantidade - 1;
    parcelas.push({
      numero: i + 1,
      dataVencimento: vencimentoDaParcela(plano.primeiroVencimento, plano.periodicidade, i),
      valor: Dinheiro.deCentavos(ultima ? base + sobra : base),
    });
  }
  return parcelas;
}

/**
 * A conferencia do servidor.
 *
 * A previa e EDITAVEL — o usuario pode mudar valores e datas para refletir o
 * combinado de verdade. Justamente por isso o servidor nao pode confiar no que
 * chega: se a soma nao bater com o total, o titulo passaria a valer uma coisa
 * e as parcelas, outra, e o erro so apareceria meses depois, na cobranca.
 */
export function validarPlanoDeParcelas(
  parcelas: readonly ParcelaPlanejada[],
  total: Dinheiro,
): Resultado<void, PlanoDeParcelasInvalido> {
  if (parcelas.length < MINIMO_PARCELAS) {
    return falha(new PlanoDeParcelasInvalido(`Um parcelamento precisa de pelo menos ${MINIMO_PARCELAS} parcelas.`));
  }
  if (parcelas.length > MAXIMO_PARCELAS) {
    return falha(new PlanoDeParcelasInvalido(`O maximo e de ${MAXIMO_PARCELAS} parcelas.`));
  }

  for (const parcela of parcelas) {
    if (!parcela.valor.ehPositivo()) {
      return falha(
        new PlanoDeParcelasInvalido(`A parcela ${parcela.numero} precisa ter valor maior que zero.`, {
          numero: parcela.numero,
        }),
      );
    }
  }

  const soma = Dinheiro.somarTodos(parcelas.map((p) => p.valor));
  if (!soma.igual(total)) {
    return falha(
      new PlanoDeParcelasInvalido(
        `A soma das parcelas (${soma.formatarBrasileiro()}) precisa ser igual ao total (${total.formatarBrasileiro()}).`,
        { soma: soma.paraTexto(), total: total.paraTexto() },
      ),
    );
  }

  return sucesso(undefined);
}
