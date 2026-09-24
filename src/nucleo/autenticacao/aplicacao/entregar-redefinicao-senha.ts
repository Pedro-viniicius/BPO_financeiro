import type { MensagemEmail } from "@/integracoes/email/publico";

/**
 * Entrega o e-mail de redefinicao de senha SEM deixar a falha chegar a quem pediu.
 *
 * O Better Auth so chama o envio quando o e-mail EXISTE; para e-mail
 * desconhecido ele responde "enviado" sem enviar nada. Se a falha do
 * provedor subisse daqui, a tela diria "nao foi possivel enviar" so para
 * e-mails cadastrados — e a tela de "esqueci minha senha" viraria um
 * verificador de cadastro. A falha fica visivel para a OPERACAO, no log de
 * erro, nunca para quem digitou o e-mail.
 */
export interface DependenciasEntregaRedefinicao {
  readonly enviar: (mensagem: MensagemEmail) => Promise<void>;
  readonly logs: {
    info(mensagem: string, dados?: Record<string, unknown>): void;
    erro(mensagem: string, dados?: Record<string, unknown>): void;
  };
}

/** Nunca lanca: devolve `true` se o provedor aceitou a mensagem. */
export async function entregarRedefinicaoDeSenha(
  dependencias: DependenciasEntregaRedefinicao,
  mensagem: MensagemEmail,
  usuarioId: string,
): Promise<boolean> {
  try {
    await dependencias.enviar(mensagem);
    dependencias.logs.info("e-mail de redefinicao de senha entregue ao provedor", { usuarioId });
    return true;
  } catch (erro) {
    dependencias.logs.erro("falha ao enviar e-mail de redefinicao de senha", {
      usuarioId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return false;
  }
}
