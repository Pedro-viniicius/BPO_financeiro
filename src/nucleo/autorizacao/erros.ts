import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/erro-dominio";

import type { Permissao } from "./permissoes";

/** O usuario esta autenticado, mas nao tem a permissao exigida. */
export class UsuarioSemPermissao extends ErroDominio {
  readonly codigo = "usuario_sem_permissao";
  readonly categoria: CategoriaErro = "sem_permissao";

  constructor(permissao: Permissao) {
    super("Você não tem permissão para realizar esta ação.", { permissao });
  }
}

/** O usuario tentou agir em uma empresa com a qual nao tem vinculo. */
export class UsuarioSemAcessoAEmpresa extends ErroDominio {
  readonly codigo = "usuario_sem_acesso_a_empresa";
  readonly categoria: CategoriaErro = "sem_permissao";

  constructor() {
    super("Você não tem acesso a esta empresa.");
  }
}
