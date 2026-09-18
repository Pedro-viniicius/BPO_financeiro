import type { Permissao } from "@/nucleo/autorizacao/publico";

/**
 * Mapa da navegacao principal.
 *
 * Esta lista e a arquitetura de informacao em codigo. Ela NAO reflete as
 * tabelas do banco: reflete tarefas humanas. Antes de acrescentar um item,
 * leia os quatro criterios em docs/ux/arquitetura-informacao.md, secao 8.
 */

export interface ItemDeNavegacao {
  /** Rotulo como o usuario le — com acento. */
  readonly rotulo: string;
  readonly rota: string;
  /** Permissao minima para ver o item. Sem ela, o item nao e renderizado. */
  readonly permissao: Permissao;
  /** Frase curta usada como titulo acessivel e dica. */
  readonly descricao: string;
  /** Apenas dois itens podem exibir contador; mais do que isso vira ruido. */
  readonly aceitaContador?: boolean;
}

export interface GrupoDeNavegacao {
  /** Vazio no primeiro grupo: "Início" nao precisa de rotulo. */
  readonly rotulo: string;
  readonly itens: readonly ItemDeNavegacao[];
}

export const NAVEGACAO_PRINCIPAL: readonly GrupoDeNavegacao[] = [
  {
    rotulo: "",
    itens: [
      {
        rotulo: "Início",
        rota: "/",
        permissao: "relatorios.visualizar",
        descricao: "Sua situação de hoje e o que precisa de atenção",
      },
    ],
  },
  {
    rotulo: "Operação",
    itens: [
      {
        rotulo: "Contas a pagar",
        rota: "/contas-pagar",
        permissao: "contas_pagar.visualizar",
        descricao: "Compromissos com fornecedores, impostos e serviços",
        aceitaContador: true,
      },
      {
        rotulo: "Contas a receber",
        rota: "/contas-receber",
        permissao: "contas_receber.visualizar",
        descricao: "Vendas e serviços que você tem a receber",
      },
    ],
  },
  {
    rotulo: "Tesouraria",
    itens: [
      {
        rotulo: "Bancos e caixa",
        rota: "/bancos",
        permissao: "bancos.visualizar",
        descricao: "Onde está o seu dinheiro",
      },
      {
        rotulo: "Conciliação",
        rota: "/conciliacao",
        permissao: "bancos.conciliar",
        descricao: "Conferir o extrato com os seus lançamentos",
        aceitaContador: true,
      },
      {
        rotulo: "Fluxo de caixa",
        rota: "/fluxo-de-caixa",
        permissao: "fluxo_caixa.visualizar",
        descricao: "Entradas e saídas no tempo",
      },
    ],
  },
  {
    rotulo: "Gestão",
    itens: [
      {
        rotulo: "Resultados",
        rota: "/resultados",
        permissao: "dre.visualizar",
        descricao: "DRE gerencial, margens e indicadores",
      },
      {
        rotulo: "Orçamento",
        rota: "/orcamento",
        permissao: "orcamento.visualizar",
        descricao: "Planejado comparado ao realizado",
      },
      {
        rotulo: "Dívidas",
        rota: "/dividas",
        permissao: "dividas.visualizar",
        descricao: "Empréstimos e financiamentos",
      },
    ],
  },
];

/** Itens de apoio, no rodape da barra lateral. */
export const NAVEGACAO_APOIO: readonly ItemDeNavegacao[] = [
  {
    rotulo: "Cadastros",
    rota: "/cadastros",
    permissao: "cadastros.visualizar",
    descricao: "Clientes, fornecedores, categorias e centros de custo",
  },
  {
    rotulo: "Configurações",
    rota: "/configuracoes",
    permissao: "configuracao.gerenciar",
    descricao: "Empresa, usuários, preferências e auditoria",
  },
];

/** Filtra a navegacao pelas permissoes efetivas do usuario (negar por padrao). */
export function navegacaoVisivel(
  permissoes: ReadonlySet<Permissao>,
  grupos: readonly GrupoDeNavegacao[] = NAVEGACAO_PRINCIPAL,
): readonly GrupoDeNavegacao[] {
  return grupos
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => permissoes.has(item.permissao)) }))
    .filter((grupo) => grupo.itens.length > 0);
}

/** Verdadeiro quando a rota atual pertence ao item (considera subrotas). */
export function rotaAtiva(rotaAtual: string, rotaDoItem: string): boolean {
  if (rotaDoItem === "/") return rotaAtual === "/";
  return rotaAtual === rotaDoItem || rotaAtual.startsWith(`${rotaDoItem}/`);
}
