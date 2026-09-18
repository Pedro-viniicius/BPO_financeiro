/**
 * Porta para recepcao de webhooks (avisos enviados por sistemas externos,
 * ex.: "boleto pago", "PIX recebido").
 *
 * Fluxo obrigatorio: validar assinatura -> gravar o evento bruto -> enfileirar
 * tarefa -> responder 200. O processamento nunca acontece na requisicao.
 */
export interface WebhookRecebido {
  readonly origem: string;
  readonly cabecalhos: Readonly<Record<string, string>>;
  readonly corpoBruto: Uint8Array;
  readonly recebidoEm: Date;
}

export interface ReceptorWebhook {
  readonly origem: string;
  /** Verifica a assinatura/segredo. Deve ser resistente a comparacao por tempo. */
  validarAssinatura(webhook: WebhookRecebido): Promise<boolean>;
  /** Converte o corpo em uma tarefa a enfileirar. */
  interpretar(webhook: WebhookRecebido): Promise<{ tipoTarefa: string; dados: Record<string, unknown> }>;
}
