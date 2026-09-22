import { type CategoriaErro, ErroDominio } from "../erros/erro-dominio";
import { falha, type Resultado, sucesso } from "../erros/resultado";
import { Dinheiro } from "../dinheiro/indice";

/**
 * A regra que impede dinheiro de aparecer do nada.
 *
 * Uma baixa so vale se abater algo, se abater no maximo o que falta, e se a
 * parte em dinheiro for positiva. Sem isso, pagar R$ 100 numa conta ja quitada
 * criaria saldo negativo, e valor negativo "desfaria" uma baixa sem estorno e
 * sem rastro.
 *
 * Fica em `compartilhado/` pelo mesmo motivo de `baixa-de-parcela.ts`: pagar e
 * receber usam a MESMA regra, e duplicar seria duas chances de afrouxar uma
 * delas sem querer.
 *
 * ----------------------------------------------------------------------
 * OS TRES VALORES QUE NAO SE CONFUNDEM
 *
 * Numa baixa com juros, multa e desconto, tres numeros diferentes convivem:
 *
 *   PRINCIPAL    a parte em dinheiro que corresponde a divida em si
 *   ABATIMENTO   principal + desconto — quanto o saldo da parcela diminui
 *   NO BANCO     principal + juros + multa — quanto sai/entra na conta
 *
 * Conta de R$ 1.000 quitada com R$ 950 e R$ 50 de desconto: sai R$ 950 da
 * conta, o saldo cai R$ 1.000, a parcela fica liquidada. O desconto nao e
 * dinheiro que andou — e divida perdoada, e o Gate 7 vai classifica-lo como
 * desconto concedido/obtido, nao como despesa.
 *
 * Conta de R$ 1.000 vencida paga com R$ 50 de juros: saem R$ 1.050 da conta e
 * o saldo cai R$ 1.000. Conferir o total contra o saldo recusaria esse
 * pagamento legitimo — por isso o que se confere e o ABATIMENTO.
 *
 * No banco de dados, `valor_principal` guarda o ABATIMENTO (e o CHECK
 * `valor_pago = principal + juros + multa - desconto` fecha a conta). A tela
 * fala a lingua do usuario; a traducao acontece no repositorio.
 */

export class ValorDaBaixaInvalido extends ErroDominio {
  readonly codigo = "valor_da_baixa_invalido";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

export interface ValorDaBaixa {
  /** Parte em dinheiro que abate a divida. Juros e multa NAO abatem. */
  readonly valorPrincipal: Dinheiro;
  /** Parte perdoada, que abate sem dinheiro nenhum sair. */
  readonly valorDesconto?: Dinheiro;
  readonly saldoRestante: Dinheiro;
}

/** Quanto o saldo da parcela diminui: o dinheiro mais o perdao. */
export function abatimentoDaBaixa(valorPrincipal: Dinheiro, valorDesconto: Dinheiro = Dinheiro.zero()): Dinheiro {
  return valorPrincipal.somar(valorDesconto);
}

/** Quanto sai (ou entra) na conta bancaria. Desconto nao entra: ele nao e dinheiro. */
export function valorQueMovimentaOBanco(
  valorPrincipal: Dinheiro,
  valorJuros: Dinheiro = Dinheiro.zero(),
  valorMulta: Dinheiro = Dinheiro.zero(),
): Dinheiro {
  return valorPrincipal.somar(valorJuros).somar(valorMulta);
}

export function validarValorDaBaixa(valores: ValorDaBaixa): Resultado<void, ValorDaBaixaInvalido> {
  const { valorPrincipal, saldoRestante } = valores;
  const desconto = valores.valorDesconto ?? Dinheiro.zero();

  if (!valorPrincipal.ehPositivo()) {
    return falha(new ValorDaBaixaInvalido("O valor precisa ser maior que zero.", { valor: valorPrincipal.paraTexto() }));
  }

  if (desconto.ehNegativo()) {
    return falha(new ValorDaBaixaInvalido("O desconto não pode ser negativo.", { desconto: desconto.paraTexto() }));
  }

  if (saldoRestante.ehZero()) {
    return falha(new ValorDaBaixaInvalido("Esta parcela já foi quitada."));
  }

  const abatimento = abatimentoDaBaixa(valorPrincipal, desconto);
  if (abatimento.maiorQue(saldoRestante)) {
    const comDesconto = desconto.ehPositivo() ? " (valor mais desconto)" : "";
    return falha(
      new ValorDaBaixaInvalido(
        `O valor${comDesconto} não pode passar do saldo restante (${saldoRestante.formatarBrasileiro()}).`,
        { valor: valorPrincipal.paraTexto(), desconto: desconto.paraTexto(), saldo: saldoRestante.paraTexto() },
      ),
    );
  }

  return sucesso(undefined);
}
