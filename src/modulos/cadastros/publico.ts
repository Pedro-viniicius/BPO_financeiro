/**
 * Interface publica do modulo "cadastros".
 * Pessoas (identidade, por organizacao) e os papeis cliente/fornecedor
 * (por empresa), mais categorias financeiras e plano de contas.
 */
export type {
  CategoriaNaLista,
  DadosNovaCategoria,
  DadosNovaPessoa,
  OpcaoSimples,
  PessoaNaLista,
  RepositorioCadastros,
} from "./aplicacao/repositorio-cadastros";
export { RepositorioCadastrosDrizzle } from "./infraestrutura/repositorio-cadastros-drizzle";
