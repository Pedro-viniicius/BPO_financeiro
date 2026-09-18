import { UsuarioSemPermissao } from "./erros";
import { type Papel, PERMISSOES_POR_PAPEL } from "./papeis";
import { ehPermissaoConhecida, type Permissao } from "./permissoes";

/**
 * Politica central de autorizacao. TODA verificacao de permissao do sistema
 * passa por aqui. Nenhum componente de interface ou rota decide sozinho.
 *
 * Regra unica: negar por padrao. Se a permissao nao estiver no conjunto
 * efetivo do usuario, a resposta e "nao".
 */

export interface PortadorPermissoes {
  readonly permissoes: ReadonlySet<Permissao>;
}

/** Responde se o portador possui a permissao. Nunca lanca. */
export function possuiPermissao(portador: PortadorPermissoes, permissao: Permissao): boolean {
  return portador.permissoes.has(permissao);
}

/** Lanca `UsuarioSemPermissao` se faltar a permissao. Use no inicio de cada caso de uso. */
export function exigirPermissao(portador: PortadorPermissoes, permissao: Permissao): void {
  if (!possuiPermissao(portador, permissao)) {
    throw new UsuarioSemPermissao(permissao);
  }
}

/** Verdadeiro se possuir TODAS as permissoes. */
export function possuiTodas(portador: PortadorPermissoes, permissoes: readonly Permissao[]): boolean {
  return permissoes.every((permissao) => possuiPermissao(portador, permissao));
}

/** Verdadeiro se possuir AO MENOS UMA das permissoes. */
export function possuiAlguma(portador: PortadorPermissoes, permissoes: readonly Permissao[]): boolean {
  return permissoes.some((permissao) => possuiPermissao(portador, permissao));
}

/**
 * Calcula o conjunto efetivo de permissoes de um vinculo:
 *   permissoes do papel + extras - removidas.
 * Textos desconhecidos (permissao que nao existe mais) sao ignorados em vez
 * de quebrar o acesso.
 */
export function resolverPermissoesEfetivas(
  papel: Papel,
  permissoesExtras: readonly string[] = [],
  permissoesRemovidas: readonly string[] = [],
): ReadonlySet<Permissao> {
  const efetivas = new Set<Permissao>(PERMISSOES_POR_PAPEL[papel]);
  for (const texto of permissoesExtras) {
    if (ehPermissaoConhecida(texto)) efetivas.add(texto);
  }
  for (const texto of permissoesRemovidas) {
    if (ehPermissaoConhecida(texto)) efetivas.delete(texto);
  }
  return efetivas;
}
