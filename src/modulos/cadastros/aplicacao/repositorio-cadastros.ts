import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * Cadastros: pessoas e os papeis que elas exercem perante uma empresa.
 *
 * O modelo do Gate 3 separa IDENTIDADE de PAPEL: `pessoas` guarda quem e
 * (nome, documento) e pertence a ORGANIZACAO; `clientes` e `fornecedores` sao
 * papeis por EMPRESA, apontando para a mesma pessoa. E o que permite a mesma
 * escola ser cliente numa empresa e fornecedora em outra sem duplicar cadastro.
 */

export interface PessoaNaLista {
  readonly pessoaId: string;
  readonly nome: string;
  readonly tipo: "fisica" | "juridica";
  readonly cpfCnpj: string | null;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly ehCliente: boolean;
  readonly ehFornecedor: boolean;
  /** Id do papel, quando existir. E ele que titulos referenciam. */
  readonly clienteId: string | null;
  readonly fornecedorId: string | null;
}

export interface DadosNovaPessoa {
  readonly nome: string;
  readonly tipo: "fisica" | "juridica";
  readonly cpfCnpj?: string;
  readonly email?: string;
  readonly telefone?: string;
  readonly ehCliente: boolean;
  readonly ehFornecedor: boolean;
}

export interface OpcaoSimples {
  readonly id: string;
  readonly nome: string;
}

export interface CategoriaNaLista extends OpcaoSimples {
  readonly contaPlanoNome: string;
  readonly grupoDre: string;
}

export interface DadosNovaCategoria {
  readonly nome: string;
  readonly contaPlanoId: string;
}

export interface RepositorioCadastros {
  listarPessoas(escopo: EscopoEmpresa, busca?: string): Promise<readonly PessoaNaLista[]>;
  criarPessoa(escopo: EscopoEmpresa, dados: DadosNovaPessoa): Promise<{ pessoaId: string }>;
  /** Papeis para os seletores de titulo. Devolve o id do PAPEL, nao da pessoa. */
  listarFornecedores(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]>;
  listarClientes(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]>;
  listarCategorias(escopo: EscopoEmpresa): Promise<readonly CategoriaNaLista[]>;
  criarCategoria(escopo: EscopoEmpresa, dados: DadosNovaCategoria): Promise<{ categoriaId: string }>;
  listarContasPlano(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]>;
  /** Cria o plano de contas e as categorias iniciais. Nao faz nada se ja houver plano. */
  semearPlanoPadrao(escopo: EscopoEmpresa): Promise<{ contasCriadas: number; categoriasCriadas: number }>;
}
