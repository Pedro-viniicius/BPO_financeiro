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
 *
 * COBRE TODAS AS LINHAS DO DEMONSTRATIVO que nascem de categoria. Uma linha
 * sem nenhuma categoria possivel e uma linha que NUNCA vai receber valor: o
 * usuario nao tem como classificar um custo se nao existe categoria de custo,
 * e o resultado sai errado sem nenhum aviso. Ha teste guardando isso.
 *
 * Duas linhas ficam de fora de proposito, porque nao vem de categoria:
 * `descontos_concedidos` e `descontos_obtidos` sao calculados a partir das
 * baixas (o desconto dado ou obtido no pagamento), nao de uma classificacao.
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
    nome: "Despesas financeiras",
    grupoDre: "resultado_financeiro",
    categorias: ["Tarifas bancárias", "Juros e multas pagos", "Juros de empréstimos"],
  },
  /*
   * Mesmo grupo das despesas financeiras: o demonstrativo decide entre
   * "receitas financeiras" e "despesas financeiras" pelo SENTIDO do
   * lancamento (entrada ou saida), nao pela conta. Sao duas contas so para
   * quem le o plano nao precisar adivinhar onde classificar um rendimento.
   */
  {
    codigo: "3.2.01",
    nome: "Receitas financeiras",
    grupoDre: "resultado_financeiro",
    categorias: ["Rendimento de aplicações", "Juros e multas recebidos"],
  },
  {
    codigo: "4.0.01",
    nome: "Custos",
    grupoDre: "custo",
    categorias: ["Custo dos serviços prestados", "Material aplicado"],
  },
  {
    codigo: "5.1.01",
    nome: "Não operacional",
    grupoDre: "nao_operacional",
    categorias: ["Venda de bens do ativo", "Outras receitas e despesas"],
  },
  /*
   * Grupo `transferencia`: fica FORA do demonstrativo de proposito. Amortizar
   * divida nao e despesa (o dinheiro sai, mas a divida cai na mesma medida), e
   * o credito de um emprestimo nao e receita. Sem esta conta, o modulo de
   * dividas precisa cria-la sozinho no primeiro emprestimo — o que funciona,
   * mas deixa o plano com uma conta que ninguem colocou ali.
   */
  {
    codigo: "9.9.02",
    nome: "Movimentação de dívidas",
    grupoDre: "transferencia",
    categorias: ["Amortização de dívidas"],
  },
];
