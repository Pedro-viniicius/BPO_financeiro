import type { MensagemEmail } from "@/integracoes/email/publico";

/**
 * Monta o e-mail de redefinicao de senha.
 *
 * Fica separado do Better Auth e do enviador de proposito: o texto que o
 * cliente le e conteudo do produto, nao detalhe de biblioteca nem de
 * provedor. Funcao pura — da para testar o link e o texto sem rede.
 */

export interface DadosRedefinicaoSenha {
  readonly para: string;
  readonly nome: string;
  readonly token: string;
  /** URL publica da aplicacao, sem barra no fim (`APLICACAO_URL`). */
  readonly aplicacaoUrl: string;
  /** Validade do link, em minutos, para dizer a verdade ao leitor. */
  readonly validadeEmMinutos: number;
}

/** Endereco da tela que troca a senha, com o token na query. */
export function ligacaoDeRedefinicao(aplicacaoUrl: string, token: string): string {
  const base = aplicacaoUrl.replace(/\/+$/, "");
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export function montarMensagemRedefinicaoSenha(dados: DadosRedefinicaoSenha): MensagemEmail {
  const ligacao = ligacaoDeRedefinicao(dados.aplicacaoUrl, dados.token);
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome;

  // Texto puro: chega igual em qualquer cliente de e-mail e nao depende de
  // imagens. A ultima linha importa tanto quanto a primeira — quem NAO pediu
  // precisa saber que nao ha nada a fazer.
  const texto = [
    `Olá, ${primeiroNome}.`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no Financeiro.",
    "Abra o endereço abaixo para escolher uma nova senha:",
    "",
    ligacao,
    "",
    `O link vale por ${dados.validadeEmMinutos} minutos e só pode ser usado uma vez.`,
    "",
    "Se não foi você que pediu, ignore esta mensagem: sua senha continua a mesma.",
  ].join("\n");

  return {
    para: dados.para,
    assunto: "Redefinir a sua senha",
    texto,
  };
}
