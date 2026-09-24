/**
 * Interface publica do modulo de empresas (organizacao -> empresa -> filial)
 * e do acesso de usuarios a elas (vinculos, empresa ativa, primeiro acesso).
 */
export type { Empresa, Filial, Organizacao } from "./dominio/estrutura-empresarial";
export { resolverEmpresaAtiva, UsuarioJaPossuiEmpresa, CnpjJaCadastrado, type EmpresaAcessivel } from "./dominio/acesso-empresas";
export {
  esquemaInstalacaoEmpresa,
  instalarPrimeiraEmpresa,
  PAPEL_DO_INSTALADOR,
  type DadosInstalacaoEmpresa,
} from "./aplicacao/instalar-primeira-empresa";
export { trocarEmpresaAtiva } from "./aplicacao/trocar-empresa-ativa";
export type { LeitorAcessoEmpresas, UnidadeInstalacaoEmpresa } from "./aplicacao/repositorio-acesso-empresas";
export { RepositorioAcessoEmpresasDrizzle } from "./infraestrutura/repositorio-acesso-empresas-drizzle";
export type { DadosDaEmpresa, RepositorioDadosDaEmpresa } from "./aplicacao/dados-da-empresa";
export { RepositorioDadosDaEmpresaDrizzle } from "./infraestrutura/repositorio-dados-empresa-drizzle";
export type {
  ConvitePendente,
  ConviteParaAceite,
  RepositorioGestaoDeUsuarios,
  UsuarioDaEmpresa,
} from "./aplicacao/gestao-de-usuarios";
export { RepositorioGestaoDeUsuariosDrizzle } from "./infraestrutura/repositorio-gestao-usuarios-drizzle";
export {
  ConviteInvalido,
  linkDoConvite,
  PRAZO_DO_CONVITE_HORAS,
} from "./dominio/convite";
export {
  NaoPodeAlterarOProprioAcesso,
  RedefinicaoNaoPermitida,
  UltimoAdministrador,
  UsuarioNaoEncontradoNaEmpresa,
} from "./dominio/regras-de-acesso";
export { montarMensagemRedefinicaoAcesso, type DadosRedefinicaoAcesso } from "./aplicacao/mensagem-redefinicao-acesso";
export { AcessoEmpresasEmMemoria } from "./infraestrutura/acesso-empresas-em-memoria";
export { decidirDestino, destinoPadrao, retornoSeguro, ROTAS, type EstadoAcesso } from "./interface/destino";
export {
  decidirAcesso,
  exigirAcesso,
  type AcessoParaDecisao,
  type DecisaoAcesso,
  type PermissoesExigidas,
} from "./interface/guarda-acesso";
export {
  estadoAcessoAtual,
  exigirContextoAplicacao,
  exigirSessaoSemEmpresa,
  listarEmpresasAcessiveisDoUsuario,
  redirecionarSeJaEntrou,
  resolverContextoAplicacao,
  rotaAtualDaRequisicao,
  type ContextoAplicacao,
  type ResolucaoContexto,
} from "./interface/contexto-aplicacao";
export { acaoInstalarPrimeiraEmpresa, acaoTrocarEmpresaAtiva, type EstadoFormularioInstalacao } from "./interface/acoes-empresas";
export { gravarPreferenciaEmpresaAtiva, apagarPreferenciaEmpresaAtiva } from "./interface/cookie-empresa-ativa";
