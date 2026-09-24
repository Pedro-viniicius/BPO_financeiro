import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * As travas de quem pode mexer no acesso de quem.
 *
 * Duas delas existem para impedir que a empresa fique TRANCADA FORA do proprio
 * sistema. Um sistema sem nenhum administrador ativo nao tem como conceder
 * permissao a ninguem — e a saida passa a ser mexer no banco de dados. Foi
 * justamente o que o Gate 9 veio eliminar.
 *
 * Funcoes puras, de proposito: a regra e a mesma na tela, na acao e no
 * repositorio, e pode ser testada sem banco.
 */

export class UltimoAdministrador extends ErroDominio {
  readonly codigo = "ultimo_administrador";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(oQue: "desativar" | "rebaixar") {
    super(
      oQue === "desativar"
        ? "Este é o único administrador ativo. Desativá-lo deixaria a empresa sem ninguém que possa conceder acesso. Promova outra pessoa a administrador antes."
        : "Este é o único administrador ativo. Mudar o papel dele deixaria a empresa sem ninguém que possa conceder acesso. Promova outra pessoa a administrador antes.",
    );
  }
}

export class NaoPodeAlterarOProprioAcesso extends ErroDominio {
  readonly codigo = "nao_pode_alterar_o_proprio_acesso";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(oQue: "desativar" | "rebaixar") {
    super(
      oQue === "desativar"
        ? "Você não pode desativar a si mesmo. Peça a outro administrador."
        : "Você não pode retirar a própria administração. Peça a outro administrador.",
    );
  }
}

export interface SituacaoDoAcesso {
  /** Quem esta sendo alterado. */
  readonly alvoUsuarioId: string;
  readonly alvoEhAdministradorAtivo: boolean;
  /** Quem esta fazendo a alteracao. */
  readonly autorUsuarioId: string;
  /** Quantos administradores ATIVOS a empresa tem agora, contando o alvo. */
  readonly administradoresAtivos: number;
}

/**
 * Pode mudar o papel deste usuario?
 *
 * Duas recusas, nesta ordem: ninguem retira a propria administracao (erro
 * comum, e de consequencia imediata para quem o comete), e o ultimo
 * administrador ativo nao pode virar outra coisa.
 */
export function verificarAlteracaoDePapel(situacao: SituacaoDoAcesso, novoPapelEhAdministrador: boolean): void {
  if (novoPapelEhAdministrador) return; // promover nunca tranca ninguem de fora

  if (situacao.alvoUsuarioId === situacao.autorUsuarioId && situacao.alvoEhAdministradorAtivo) {
    throw new NaoPodeAlterarOProprioAcesso("rebaixar");
  }
  if (situacao.alvoEhAdministradorAtivo && situacao.administradoresAtivos <= 1) {
    throw new UltimoAdministrador("rebaixar");
  }
}

/** Pode desativar este usuario? */
export function verificarDesativacao(situacao: SituacaoDoAcesso): void {
  if (situacao.alvoUsuarioId === situacao.autorUsuarioId) {
    throw new NaoPodeAlterarOProprioAcesso("desativar");
  }
  if (situacao.alvoEhAdministradorAtivo && situacao.administradoresAtivos <= 1) {
    throw new UltimoAdministrador("desativar");
  }
}

/**
 * O alvo nao tem vinculo com a EMPRESA ATIVA de quem esta alterando.
 *
 * Um vinculo e por empresa. Administrar a empresa A nao da direito de mexer
 * no acesso que alguem tem a empresa B do mesmo grupo — nem de descobrir,
 * pela mensagem, que esse alguem existe em B. Por isso a resposta e a mesma
 * de "nao existe": nao encontrado nesta empresa.
 */
export class UsuarioNaoEncontradoNaEmpresa extends ErroDominio {
  readonly codigo = "usuario_nao_encontrado_na_empresa";
  readonly categoria: CategoriaErro = "nao_encontrado";

  constructor() {
    super("Esta pessoa não tem acesso a esta empresa.");
  }
}

/**
 * A redefinicao de acesso trocaria a senha de uma conta que serve TAMBEM a
 * outra organizacao.
 *
 * A conta e da pessoa, nao da empresa. Quem administra a organizacao X nao
 * pode receber um link que abre a conta de alguem em Y e Z — seria entrar,
 * como essa pessoa, em lugares que nunca concederam acesso a X. Para quem
 * esta nessa situacao o caminho e "Esqueci minha senha", que so o dono do
 * e-mail recebe.
 */
export class RedefinicaoNaoPermitida extends ErroDominio {
  readonly codigo = "redefinicao_nao_permitida";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(motivo: "conta_compartilhada") {
    super(
      {
        conta_compartilhada:
          "Esta pessoa também tem acesso a outra organização. Por segurança, só ela pode redefinir a própria senha, em “Esqueci minha senha”.",
      }[motivo],
      { motivo },
    );
  }
}
