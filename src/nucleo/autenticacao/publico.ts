/**
 * Interface publica do modulo de autenticacao.
 * Responde "quem e o usuario?". Para "o que ele pode fazer?", ver `nucleo/autorizacao`.
 */
export type { SessaoAtual } from "./aplicacao/sessao-atual";
export { DICA_SENHA, TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "./dominio/regras-senha";
export { obterSessaoAtual } from "./interface/obter-sessao-atual";
export { obterAutenticacao, cadastroAberto, type Autenticacao } from "./infraestrutura/better-auth";
export type { Credenciais, UsuarioDeAutenticacao } from "./aplicacao/credenciais";
export { CredenciaisBetterAuth } from "./infraestrutura/credenciais-better-auth";
export {
  criarContaComEmail,
  entrarComEmail,
  pedirRedefinicaoDeSenha,
  redefinirSenha,
  sairDaSessao,
  verificarSegundoFator,
  type CredenciaisEntrada,
  type DadosNovaConta,
  type ResultadoEntrada,
} from "./interface/acoes-sessao";
export { ehAtivacaoDeSegundoFator, MOTIVO_ATIVACAO_INDISPONIVEL } from "./interface/portao-segundo-fator";
export { tratarRequisicaoAutenticacao, type DependenciasTratamento } from "./interface/tratar-requisicao";
export {
  AtivacaoSegundoFatorIndisponivel,
  CadastroFechado,
  CodigoSegundoFatorInvalido,
  CredenciaisInvalidas,
  DesafioSegundoFatorExpirado,
  EmailJaCadastrado,
  FalhaAoEnviarEmail,
  MuitasTentativas,
  TokenRedefinicaoInvalido,
} from "./dominio/erros";
