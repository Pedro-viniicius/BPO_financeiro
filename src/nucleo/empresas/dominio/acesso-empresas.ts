import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/erro-dominio";
import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";
import type { Papel } from "@/nucleo/autorizacao/publico";

/**
 * Uma empresa que o usuario pode usar, ja com o vinculo que da esse acesso.
 *
 * E a unica forma de "empresa" que sai de `nucleo/empresas` para a casca e
 * para a resolucao de contexto: se nao esta nesta lista, o usuario nao a ve.
 */
export interface EmpresaAcessivel {
  readonly empresaId: IdEmpresa;
  readonly organizacaoId: IdOrganizacao;
  readonly nome: string;
  readonly nomeFantasia?: string;
  readonly fusoHorario: string;
  /** Papel do vinculo que concede o acesso. */
  readonly papel: Papel;
  readonly permissoesExtras: readonly string[];
  readonly permissoesRemovidas: readonly string[];
  /** Verdadeiro quando o acesso vem de um vinculo "toda a organizacao". */
  readonly acessoPelaOrganizacao: boolean;
}

/**
 * Escolhe a empresa ativa entre as acessiveis.
 *
 * `preferenciaId` e o que o navegador LEMBRA (cookie), nunca o que ele
 * autoriza: so vale se estiver na lista. Sem preferencia valida, a primeira
 * em ordem alfabetica vira ativa e o usuario troca no cabecalho — e o
 * comportamento mais simples que nao exige uma tela de escolha.
 *
 * Devolve `null` quando nao ha empresa acessivel.
 */
export function resolverEmpresaAtiva(
  acessiveis: readonly EmpresaAcessivel[],
  preferenciaId: string | undefined,
): EmpresaAcessivel | null {
  if (acessiveis.length === 0) return null;
  const preferida = preferenciaId ? acessiveis.find((empresa) => empresa.empresaId === preferenciaId) : undefined;
  if (preferida) return preferida;
  return [...acessiveis].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))[0] ?? null;
}

/** O usuario ja tem empresa; o instalador da primeira empresa nao se aplica. */
export class UsuarioJaPossuiEmpresa extends ErroDominio {
  readonly codigo = "usuario_ja_possui_empresa";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(usuarioId: IdUsuario) {
    super("Você já tem acesso a uma empresa. O primeiro acesso só vale para quem ainda não tem nenhuma.", { usuarioId });
  }
}

/** Ja existe uma empresa com este CNPJ nesta instalacao. */
export class CnpjJaCadastrado extends ErroDominio {
  readonly codigo = "cnpj_ja_cadastrado";
  readonly categoria: CategoriaErro = "conflito";

  constructor() {
    super("Já existe uma empresa cadastrada com este CNPJ. Peça acesso a quem a administra.");
  }
}
