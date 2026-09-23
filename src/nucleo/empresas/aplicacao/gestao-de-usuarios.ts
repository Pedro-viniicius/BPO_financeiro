import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { Papel } from "@/nucleo/autorizacao/publico";

/**
 * Quem tem acesso ao sistema desta empresa, e com que papel.
 *
 * Ate o Gate 9 nao havia como acrescentar usuario pela interface: era preciso
 * criar a conta pela tela publica e ligar o vinculo por SQL. E era impossivel
 * tirar o acesso de alguem sem mexer no banco.
 *
 * USUARIO NUNCA E EXCLUIDO. O historico e a auditoria apontam para ele: quem
 * deu a baixa, quem cancelou o titulo, quem mudou o plano de contas. Apagar a
 * pessoa transformaria anos de registro em "usuario desconhecido". O caminho e
 * DESATIVAR — e desativar encerra as sessoes na hora.
 */

export interface UsuarioDaEmpresa {
  readonly usuarioId: string;
  readonly nome: string;
  readonly email: string;
  readonly papel: Papel;
  readonly ativo: boolean;
  /** Ultima vez que uma sessao desta pessoa foi usada. Nulo = nunca entrou. */
  readonly ultimoAcesso: Date | null;
  /** Para a tela saber que nao deve oferecer "desativar" a quem esta olhando. */
  readonly ehVoce: boolean;
}

export interface ConvitePendente {
  readonly id: string;
  readonly email: string;
  readonly papel: Papel;
  readonly expiraEm: Date;
  readonly expirado: boolean;
  readonly convidadoPorNome: string;
}

export interface ConviteParaAceite {
  readonly email: string;
  readonly papel: Papel;
  readonly nomeDaEmpresa: string;
  /** Verdadeiro quando ja existe conta com este e-mail: e redefinicao de acesso. */
  readonly jaTemConta: boolean;
}

export interface RepositorioGestaoDeUsuarios {
  listar(
    escopo: EscopoEmpresa,
    usuarioAtualId: string,
  ): Promise<{ readonly usuarios: readonly UsuarioDaEmpresa[]; readonly convites: readonly ConvitePendente[] }>;

  /**
   * Cria o convite e devolve o TOKEN em claro — a unica vez em que ele existe
   * fora do link. O banco guarda so o hash.
   */
  convidar(
    escopo: EscopoEmpresa,
    dados: { readonly email: string; readonly papel: Papel; readonly autorUsuarioId: string },
  ): Promise<{ readonly conviteId: string; readonly token: string }>;

  cancelarConvite(escopo: EscopoEmpresa, conviteId: string, autorUsuarioId: string): Promise<void>;

  alterarPapel(escopo: EscopoEmpresa, alvoUsuarioId: string, papel: Papel, autorUsuarioId: string): Promise<void>;

  /** Desativar encerra as sessoes do alvo na mesma operacao. */
  alterarSituacao(escopo: EscopoEmpresa, alvoUsuarioId: string, ativo: boolean, autorUsuarioId: string): Promise<void>;

  /** Novo link para quem ja tem conta, nas mesmas regras do convite. */
  redefinirAcesso(escopo: EscopoEmpresa, alvoUsuarioId: string, autorUsuarioId: string): Promise<{ readonly token: string }>;

  /** Dados do convite para a tela de aceite. Nao revela nada alem do necessario. */
  lerConvitePeloToken(token: string): Promise<ConviteParaAceite | null>;

  /**
   * Usa o convite: cria a conta (ou troca a senha de quem ja tem), garante o
   * vinculo com o papel do convite e marca o convite como usado. Tudo numa
   * transacao — um convite consumido sem vinculo criado deixaria a pessoa com
   * conta e sem acesso, e sem poder tentar de novo.
   */
  aceitarConvite(token: string, dados: { readonly nome: string; readonly senha: string }): Promise<{ readonly usuarioId: string }>;
}
