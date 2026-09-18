import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/erro-dominio";

/**
 * E-mail ou senha nao conferem. A mensagem e a MESMA para e-mail inexistente
 * e para senha errada: a tela de entrada nao confirma se um cadastro existe.
 */
export class CredenciaisInvalidas extends ErroDominio {
  readonly codigo = "credenciais_invalidas";
  readonly categoria: CategoriaErro = "nao_autenticado";

  constructor() {
    super("E-mail ou senha incorretos.");
  }
}

/** O limite de tentativas do Better Auth foi atingido. */
export class MuitasTentativas extends ErroDominio {
  readonly codigo = "muitas_tentativas";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(segundos?: number) {
    const espera = segundos && segundos > 0 ? ` Tente novamente em ${Math.ceil(segundos / 60)} minuto(s).` : " Aguarde alguns minutos.";
    super(`Muitas tentativas.${espera}`, segundos ? { segundos } : undefined);
  }
}

/** O cadastro publico esta fechado nesta instalacao (entrada por convite). */
export class CadastroFechado extends ErroDominio {
  readonly codigo = "cadastro_fechado";
  readonly categoria: CategoriaErro = "sem_permissao";

  constructor() {
    super("Esta instalacao ja tem usuarios. Peca um convite a quem administra o sistema.");
  }
}

/** Ja existe conta com este e-mail. */
export class EmailJaCadastrado extends ErroDominio {
  readonly codigo = "email_ja_cadastrado";
  readonly categoria: CategoriaErro = "conflito";

  constructor() {
    super("Ja existe uma conta com este e-mail. Entre com a sua senha ou use \"Esqueci minha senha\".");
  }
}

/** A conta exige o segundo fator, cuja tela ainda nao existe (gate posterior). */
export class SegundoFatorNaoDisponivel extends ErroDominio {
  readonly codigo = "segundo_fator_nao_disponivel";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("Esta conta usa verificacao em duas etapas, que ainda nao esta disponivel nesta versao.");
  }
}
