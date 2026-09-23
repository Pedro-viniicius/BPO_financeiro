/**
 * As tres operacoes de credencial que a administracao de usuarios precisa.
 *
 * Elas existem como contrato PROPRIO, e nao como chamadas diretas ao
 * Better Auth espalhadas pelo codigo, por dois motivos:
 *
 * 1. `nucleo/empresas` nao pode conhecer o formato de armazenamento de senha
 *    de ninguem — ele so precisa dizer "defina a senha desta pessoa";
 * 2. quem implementa isto usa o hasher e o repositorio de sessao da PROPRIA
 *    biblioteca de autenticacao. Escrever um hash proprio aqui criaria senhas
 *    que o login nao reconhece.
 */

export interface UsuarioDeAutenticacao {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
}

export interface Credenciais {
  buscarPorEmail(email: string): Promise<UsuarioDeAutenticacao | null>;
  /** Cria a conta com a senha ja escolhida pela pessoa no convite. */
  criarUsuarioComSenha(dados: { nome: string; email: string; senha: string }): Promise<UsuarioDeAutenticacao>;
  /** Troca a senha de quem ja tem conta (redefinicao de acesso). */
  definirSenha(usuarioId: string, senha: string): Promise<void>;
  /**
   * Encerra TODAS as sessoes da pessoa.
   *
   * E o que faz "desativar" valer na hora: sem isto, quem ja estava com o
   * sistema aberto continuaria navegando ate a sessao vencer sozinha.
   */
  encerrarSessoes(usuarioId: string): Promise<void>;
}
