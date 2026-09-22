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

/** O codigo TOTP informado nao confere. */
export class CodigoSegundoFatorInvalido extends ErroDominio {
  readonly codigo = "codigo_segundo_fator_invalido";
  readonly categoria: CategoriaErro = "nao_autenticado";

  constructor() {
    super("Codigo incorreto. Confira o aplicativo de autenticacao e tente de novo.");
  }
}

/**
 * O desafio do segundo fator expirou ou nao existe (a pessoa abriu a tela
 * direto, demorou demais, ou o cookie foi limpo). O caminho e entrar de novo.
 */
export class DesafioSegundoFatorExpirado extends ErroDominio {
  readonly codigo = "desafio_segundo_fator_expirado";
  readonly categoria: CategoriaErro = "nao_autenticado";

  constructor() {
    super("Esta verificacao expirou. Entre com e-mail e senha novamente.");
  }
}

/**
 * Tentativa de ATIVAR o segundo fator enquanto a tela de ativacao nao existe.
 * Ver `interface/portao-segundo-fator.ts`.
 */
export class AtivacaoSegundoFatorIndisponivel extends ErroDominio {
  readonly codigo = "ativacao_segundo_fator_indisponivel";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("A verificacao em duas etapas ainda nao pode ser ativada nesta versao.");
  }
}

/** O link de redefinicao nao vale mais (expirou, ja foi usado, ou foi adulterado). */
export class TokenRedefinicaoInvalido extends ErroDominio {
  readonly codigo = "token_redefinicao_invalido";
  readonly categoria: CategoriaErro = "nao_autenticado";

  constructor() {
    super("Este link de redefinicao expirou ou ja foi usado. Peca um novo.");
  }
}

/**
 * O e-mail nao saiu (provedor fora, configuracao errada). Dito ao usuario de
 * proposito: pior do que falhar e a tela dizer "enviamos" e nada chegar.
 */
export class FalhaAoEnviarEmail extends ErroDominio {
  readonly codigo = "falha_ao_enviar_email";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor() {
    super("Nao foi possivel enviar o e-mail agora. Tente novamente em instantes ou fale com quem administra o sistema.");
  }
}
