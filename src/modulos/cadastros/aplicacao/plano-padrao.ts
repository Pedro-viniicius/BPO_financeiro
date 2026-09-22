/**
 * Plano de contas e categorias iniciais de uma empresa.
 *
 * A empresa nasce sem classificacao nenhuma, e sem categoria nao existe conta
 * a pagar nem a receber — `categoria_id` e obrigatorio nos dois. Ou seja: sem
 * esta semente, uma instalacao nova trava no primeiro lancamento.
 *
 * A semente NAO roda escondida junto da criacao da empresa. Ela e um botao na
 * tela de Cadastros, por duas razoes: o `nucleo` nao pode conhecer modulos de
 * negocio (regra de arquitetura), e porque plano de contas e decisao do
 * cliente — quem ja tem um plano proprio nao quer o nosso por cima.
 *
 * E um PONTO DE PARTIDA enxuto, nao um plano contabil completo: o suficiente
 * para lancar, classificar e depois ajustar.
 */

export interface ContaPlanoPadrao {
  readonly codigo: string;
  readonly nome: string;
  readonly grupoDre: "receita_bruta" | "deducao" | "custo" | "despesa_operacional" | "resultado_financeiro" | "nao_operacional" | "transferencia";
  /** Categorias criadas sob esta conta. */
  readonly categorias: readonly string[];
}

export const PLANO_PADRAO: readonly ContaPlanoPadrao[] = [
  {
    codigo: "3.1.01",
    nome: "Receita de serviços",
    grupoDre: "receita_bruta",
    categorias: ["Prestação de serviços", "Mensalidades"],
  },
  {
    codigo: "3.1.02",
    nome: "Receita de vendas",
    grupoDre: "receita_bruta",
    categorias: ["Venda de produtos"],
  },
  {
    codigo: "4.1.01",
    nome: "Pessoal",
    grupoDre: "despesa_operacional",
    categorias: ["Salários e encargos", "Pró-labore", "Serviços de terceiros"],
  },
  {
    codigo: "4.1.02",
    nome: "Ocupação",
    grupoDre: "despesa_operacional",
    categorias: ["Aluguel", "Energia elétrica", "Água", "Internet e telefone"],
  },
  {
    codigo: "4.1.03",
    nome: "Administrativas",
    grupoDre: "despesa_operacional",
    categorias: ["Material de escritório", "Limpeza e conservação", "Contabilidade", "Software e assinaturas"],
  },
  {
    codigo: "4.1.04",
    nome: "Impostos e taxas",
    grupoDre: "deducao",
    categorias: ["Impostos sobre faturamento", "Taxas e tarifas"],
  },
  {
    codigo: "4.2.01",
    nome: "Financeiras",
    grupoDre: "resultado_financeiro",
    categorias: ["Tarifas bancárias", "Juros e multas pagos"],
  },
];
