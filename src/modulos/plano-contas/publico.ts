/**
 * Interface publica do modulo "plano-contas".
 *
 * O plano de contas e a ponte entre o lancamento e o demonstrativo: e a
 * categoria que responde "com o que estamos gastando?". Outros modulos
 * importam SOMENTE daqui.
 */
export { CategoriaEmUso, ContaEmUso, ItemDoPlanoNaoEncontrado } from "./dominio/erros";
export type {
  CategoriaDoPlano,
  ContaDoPlano,
  DadosDaCategoria,
  DadosDaConta,
  GrupoDoPlano,
  PlanoDeContas,
  RepositorioPlanoContas,
} from "./aplicacao/repositorio-plano-contas";
export { REFERENCIAS_A_CATEGORIA, RepositorioPlanoContasDrizzle } from "./infraestrutura/repositorio-plano-contas-drizzle";
