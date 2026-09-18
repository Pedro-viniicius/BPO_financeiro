import type { RegistradorLogs } from "@/nucleo/observabilidade/publico";

import type { EnviadorEmail, MensagemEmail } from "../contratos/enviador-email";

/**
 * "Envia" e-mails escrevendo no log. Apenas para desenvolvimento e testes.
 * O corpo NAO e registrado (pode conter links de redefinicao de senha).
 */
export class EnviadorEmailConsole implements EnviadorEmail {
  constructor(private readonly logs: RegistradorLogs) {}

  async enviar(mensagem: MensagemEmail): Promise<void> {
    this.logs.info("e-mail (modo console, nao enviado)", { para: mensagem.para, assunto: mensagem.assunto });
  }
}
