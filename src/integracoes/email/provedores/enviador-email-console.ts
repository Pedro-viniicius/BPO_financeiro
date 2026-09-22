import type { RegistradorLogs } from "@/nucleo/observabilidade/publico";

import type { EnviadorEmail, MensagemEmail } from "../contratos/enviador-email";

/**
 * "Envia" e-mails escrevendo no log. Apenas para desenvolvimento e testes.
 *
 * Nenhum e-mail sai da maquina, e o log diz isso em toda linha: o rotulo e
 * sempre "nao enviado". Nunca fingimos entrega.
 *
 * O CORPO so aparece quando `mostrarConteudo` e verdadeiro — ligado apenas
 * fora de producao pela composicao. E o que torna a redefinicao de senha
 * testavel em desenvolvimento: sem ver o link, ninguem conclui o fluxo. Em
 * producao esse mesmo corpo seria um link de troca de senha em texto puro no
 * arquivo de log, entao la ele fica de fora.
 */
export class EnviadorEmailConsole implements EnviadorEmail {
  constructor(
    private readonly logs: RegistradorLogs,
    private readonly mostrarConteudo = false,
  ) {}

  async enviar(mensagem: MensagemEmail): Promise<void> {
    this.logs.aviso("e-mail NAO enviado (modo console)", {
      para: mensagem.para,
      assunto: mensagem.assunto,
      ...(this.mostrarConteudo ? { corpo: mensagem.texto } : {}),
    });
  }
}
