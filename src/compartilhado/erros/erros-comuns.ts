import { type CategoriaErro, ErroDominio } from "./erro-dominio";

/** Dados de entrada invalidos (formato, campo obrigatorio, valor fora do permitido). */
export class ErroValidacao extends ErroDominio {
  readonly codigo = "validacao";
  readonly categoria: CategoriaErro = "validacao";

  constructor(mensagem: string, campos?: Record<string, string[]>) {
    super(mensagem, campos ? { campos } : undefined);
  }
}

/** Nenhum usuario autenticado na requisicao. */
export class UsuarioNaoAutenticado extends ErroDominio {
  readonly codigo = "usuario_nao_autenticado";
  readonly categoria: CategoriaErro = "nao_autenticado";

  constructor() {
    super("E necessario entrar no sistema para continuar.");
  }
}

/**
 * Registro nao encontrado. Prefira subclasses especificas por modulo
 * (`ContaPagarNaoEncontrada`), usando esta apenas como base.
 */
export abstract class RegistroNaoEncontrado extends ErroDominio {
  readonly categoria: CategoriaErro = "nao_encontrado";
}
