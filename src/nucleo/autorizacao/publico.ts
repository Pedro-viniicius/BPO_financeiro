/**
 * Interface publica do modulo de autorizacao.
 * Responde: "o que este usuario pode fazer?" (autenticacao responde "quem e").
 */
export { PERMISSOES, ehPermissaoConhecida, type Permissao } from "./permissoes";
export { PAPEIS, NOMES_PAPEIS, PERMISSOES_POR_PAPEL, ehPapelConhecido, type Papel } from "./papeis";
export type { ContextoSistema, ContextoUsuario } from "./contexto-usuario";
export { UsuarioSemAcessoAEmpresa, UsuarioSemPermissao } from "./erros";
export {
  exigirPermissao,
  possuiAlguma,
  possuiPermissao,
  possuiTodas,
  resolverPermissoesEfetivas,
  type PortadorPermissoes,
} from "./politica-autorizacao";
