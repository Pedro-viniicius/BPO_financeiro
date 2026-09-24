import type { MensagemEmail } from "@/integracoes/email/publico";

import { linkDoConvite, PRAZO_DO_CONVITE_HORAS } from "../dominio/convite";

/**
 * O e-mail que leva o link de redefinicao de acesso AO DONO DA CONTA.
 *
 * E o unico destino possivel desse link: quem o tem define a senha da conta,
 * entao ele nunca aparece na tela de quem pediu a redefinicao. Funcao pura —
 * o texto e o link sao testaveis sem rede.
 */
export interface DadosRedefinicaoAcesso {
  readonly para: string;
  readonly token: string;
  /** URL publica da aplicacao (`APLICACAO_URL`). */
  readonly aplicacaoUrl: string;
  readonly nomeDaEmpresa: string;
}

export function montarMensagemRedefinicaoAcesso(dados: DadosRedefinicaoAcesso): MensagemEmail {
  const ligacao = linkDoConvite(dados.aplicacaoUrl, dados.token);

  const texto = [
    "Olá.",
    "",
    `Quem administra ${dados.nomeDaEmpresa} no Financeiro pediu que você defina uma nova senha de acesso.`,
    "Abra o endereço abaixo para escolher a nova senha:",
    "",
    ligacao,
    "",
    `O link vale por ${PRAZO_DO_CONVITE_HORAS} horas e só pode ser usado uma vez. Ao ser usado, as sessões abertas da sua conta são encerradas.`,
    "",
    "Se você não esperava este e-mail, ignore-o: sua senha continua a mesma. Em caso de dúvida, fale com quem administra a empresa.",
  ].join("\n");

  return {
    para: dados.para,
    assunto: `Redefinir o seu acesso ao Financeiro (${dados.nomeDaEmpresa})`,
    texto,
  };
}
