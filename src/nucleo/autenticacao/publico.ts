/**
 * Interface publica do modulo de autenticacao.
 * Responde "quem e o usuario?". Para "o que ele pode fazer?", ver `nucleo/autorizacao`.
 */
export type { SessaoAtual } from "./aplicacao/sessao-atual";
export { obterSessaoAtual } from "./interface/obter-sessao-atual";
export { obterAutenticacao, cadastroAberto, type Autenticacao } from "./infraestrutura/better-auth";
export {
  criarContaComEmail,
  entrarComEmail,
  sairDaSessao,
  type CredenciaisEntrada,
  type DadosNovaConta,
} from "./interface/acoes-sessao";
export {
  CadastroFechado,
  CredenciaisInvalidas,
  EmailJaCadastrado,
  MuitasTentativas,
  SegundoFatorNaoDisponivel,
} from "./dominio/erros";
