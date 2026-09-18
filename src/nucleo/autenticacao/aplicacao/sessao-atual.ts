import type { IdUsuario } from "@/compartilhado/tipos/identificadores";

/**
 * Sessao autenticada, no vocabulario do nosso sistema.
 *
 * E a unica coisa que o resto da aplicacao precisa saber sobre autenticacao.
 * Quem monta este objeto a partir do Better Auth e `interface/obter-sessao-atual.ts`;
 * os casos de uso e a autorizacao recebem `SessaoAtual`, nunca a sessao crua da biblioteca.
 */
export interface SessaoAtual {
  readonly usuarioId: IdUsuario;
  readonly nome: string;
  readonly email: string;
  readonly emailVerificado: boolean;
  readonly duasEtapasAtivas: boolean;
  readonly sessaoId: string;
  readonly expiraEm: Date;
}
