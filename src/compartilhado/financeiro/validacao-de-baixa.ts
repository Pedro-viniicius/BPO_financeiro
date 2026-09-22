import { type CategoriaErro, ErroDominio } from "../erros/erro-dominio";
import { falha, type Resultado, sucesso } from "../erros/resultado";
import type { Dinheiro } from "../dinheiro/indice";

/**
 * A regra que impede dinheiro de aparecer do nada.
 *
 * Um pagamento so vale se for positivo e nao passar do que ainda falta. Sem
 * isso, pagar R$ 100 numa conta ja quitada criaria saldo negativo, e pagar
 * valor negativo "desfaria" uma baixa sem estorno e sem rastro.
 *
 * Fica em `compartilhado/` pelo mesmo motivo de `baixa-de-parcela.ts`: pagar e
 * receber usam a MESMA regra, e duplicar seria duas chances de afrouxar uma
 * delas sem querer.
 */

export class ValorDaBaixaInvalido extends ErroDominio {
  readonly codigo = "valor_da_baixa_invalido";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

export interface ValorDaBaixa {
  /** Parte que abate a parcela. Juros e multa NAO abatem; desconto tambem nao. */
  readonly valorPrincipal: Dinheiro;
  readonly saldoRestante: Dinheiro;
}

/**
 * Valida o principal de uma baixa contra o saldo.
 *
 * Note que o valor conferido e o PRINCIPAL, nao o total que sai da conta.
 * Numa conta de R$ 1.000 vencida, pagar R$ 1.050 (principal 1.000 + juros 50)
 * e correto: quita a parcela e o banco registra a saida de 1.050. Conferir o
 * total contra o saldo recusaria esse pagamento legitimo.
 */
export function validarValorDaBaixa(valores: ValorDaBaixa): Resultado<void, ValorDaBaixaInvalido> {
  const { valorPrincipal, saldoRestante } = valores;

  if (!valorPrincipal.ehPositivo()) {
    return falha(new ValorDaBaixaInvalido("O valor precisa ser maior que zero.", { valor: valorPrincipal.paraTexto() }));
  }

  if (saldoRestante.ehZero()) {
    return falha(new ValorDaBaixaInvalido("Esta parcela já foi quitada."));
  }

  if (valorPrincipal.maiorQue(saldoRestante)) {
    return falha(
      new ValorDaBaixaInvalido(`O valor não pode passar do saldo restante (${saldoRestante.formatarBrasileiro()}).`, {
        valor: valorPrincipal.paraTexto(),
        saldo: saldoRestante.paraTexto(),
      }),
    );
  }

  return sucesso(undefined);
}
