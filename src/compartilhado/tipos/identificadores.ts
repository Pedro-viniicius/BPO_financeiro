/**
 * Identificadores usados em todo o sistema.
 *
 * Todo registro usa UUID (texto de 36 caracteres) gerado pela aplicacao.
 * Os tipos nominais abaixo impedem, em tempo de compilacao, passar o id de
 * uma empresa onde se espera o id de um usuario.
 */
export type Identificador<Marca extends string> = string & { readonly __marca: Marca };

export type IdOrganizacao = Identificador<"Organizacao">;
export type IdEmpresa = Identificador<"Empresa">;
export type IdFilial = Identificador<"Filial">;
export type IdUsuario = Identificador<"Usuario">;

export function gerarIdentificador<Marca extends string>(): Identificador<Marca> {
  return crypto.randomUUID() as Identificador<Marca>;
}

export function comoIdentificador<Marca extends string>(texto: string): Identificador<Marca> {
  return texto as Identificador<Marca>;
}
