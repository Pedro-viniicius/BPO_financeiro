/**
 * Porta para envio de e-mail (convites, redefinicao de senha, alertas).
 * Adaptadores: `provedores/console` (desenvolvimento) e SMTP (Gate 5).
 */
export interface MensagemEmail {
  readonly para: string;
  readonly assunto: string;
  readonly texto: string;
  readonly html?: string;
}

export interface EnviadorEmail {
  enviar(mensagem: MensagemEmail): Promise<void>;
}
