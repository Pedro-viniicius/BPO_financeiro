import { EnviadorEmailConsole, type EnviadorEmail } from "@/integracoes/email/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

/**
 * Escolhe o enviador de e-mail. Unico lugar do sistema que conhece provedores
 * concretos de e-mail (ADR-011).
 *
 * `console` e o modo de desenvolvimento: nada sai da maquina e o corpo da
 * mensagem — inclusive o link de redefinicao — aparece no log, para o fluxo
 * poder ser percorrido inteiro sem servidor de e-mail.
 *
 * `smtp` ainda NAO tem adaptador. Em vez de cair para `console` fingindo que
 * enviou, a composicao falha na hora, com instrucao. Um sistema financeiro que
 * "envia" redefinicoes de senha para lugar nenhum e pior do que um que se
 * recusa a subir mal configurado: no primeiro caso, ninguem descobre.
 */
export function montarEnviadorEmail(): EnviadorEmail {
  const variaveis = obterVariaveisAmbiente();
  const logs = criarRegistradorLogs("email");

  if (variaveis.EMAIL_PROVEDOR === "smtp") {
    throw new Error(
      "EMAIL_PROVEDOR=smtp, mas nenhum adaptador SMTP foi implementado ainda. " +
        "Use EMAIL_PROVEDOR=console (desenvolvimento) ou implemente o adaptador em " +
        "src/integracoes/email/provedores/ antes de apontar para SMTP. " +
        "Ver docs/arquitetura/integracoes.md.",
    );
  }

  const producao = variaveis.AMBIENTE === "producao";
  if (producao) {
    // Em producao, `console` significa que nenhuma mensagem chega a ninguem.
    // Nao e erro fatal (a instalacao pode nao usar e-mail ainda), mas precisa
    // ficar gritando no log em vez de passar despercebido.
    logs.aviso("EMAIL_PROVEDOR=console em producao: nenhum e-mail sera entregue (inclusive redefinicao de senha)");
  }
  return new EnviadorEmailConsole(logs, !producao);
}
