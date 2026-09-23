import { and, eq, sql } from "drizzle-orm";

import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import { categoriasFinanceiras, contasPlano } from "@/banco-dados/esquemas/indice";
import { ESTRUTURA_DRE, linhaDoLancamento, type GrupoDre, type LinhaDre } from "@/modulos/dre/publico";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import { CategoriaEmUso, ContaEmUso, ItemDoPlanoNaoEncontrado } from "../dominio/erros";
import type {
  CategoriaDoPlano,
  ContaDoPlano,
  DadosDaCategoria,
  DadosDaConta,
  GrupoDoPlano,
  PlanoDeContas,
  RepositorioPlanoContas,
} from "../aplicacao/repositorio-plano-contas";

/**
 * TODAS as tabelas que apontam para `categorias_financeiras`.
 *
 * Esta lista existe so para a MENSAGEM ("esta categoria ja esta em 4
 * lancamentos"). Quem de fato impede a exclusao e o banco: as chaves
 * estrangeiras sao `ON DELETE RESTRICT`, entao mesmo que esta lista fique
 * desatualizada a exclusao continua sendo recusada — falha fechada.
 *
 * Ainda assim ha um teste comparando esta lista com o catalogo do PostgreSQL:
 * se alguem criar uma nona referencia, o teste reprova e aponta para ca. Sem
 * isso, a tela diria "pode excluir" e a exclusao estouraria na cara do
 * usuario com erro de chave estrangeira.
 */
const TABELAS_QUE_USAM_CATEGORIA = [
  { tabela: "titulos_pagar", coluna: "categoria_id" },
  { tabela: "titulos_receber", coluna: "categoria_id" },
  { tabela: "movimentacoes_bancarias", coluna: "categoria_id" },
  { tabela: "dividas", coluna: "categoria_juros_id" },
  { tabela: "itens_orcamento", coluna: "categoria_id" },
  { tabela: "recorrencias_pagar", coluna: "categoria_id" },
  { tabela: "recorrencias_receber", coluna: "categoria_id" },
  { tabela: "categorias_financeiras", coluna: "categoria_pai_id" },
] as const;

export const REFERENCIAS_A_CATEGORIA = TABELAS_QUE_USAM_CATEGORIA;

/** `SUM` de um `EXISTS`-like por tabela, numa consulta so. */
function consultaDeUsos(): ReturnType<typeof sql> {
  const partes = TABELAS_QUE_USAM_CATEGORIA.map(
    ({ tabela, coluna }) =>
      sql`(SELECT count(*) FROM ${sql.raw(tabela)} WHERE ${sql.raw(coluna)} = c.id)`,
  );
  return sql.join(partes, sql` + `);
}

const ROTULO_DO_GRUPO: Record<GrupoDre, { rotulo: string; explicacao: string }> = {
  receita_bruta: { rotulo: "Receitas", explicacao: "Entra na linha “Receita bruta”." },
  deducao: { rotulo: "Deduções", explicacao: "Impostos e devoluções: sai da receita bruta." },
  custo: { rotulo: "Custos", explicacao: "O que custa entregar o serviço vendido." },
  despesa_operacional: { rotulo: "Despesas operacionais", explicacao: "O custo de manter a operação de pé." },
  resultado_financeiro: {
    rotulo: "Resultado financeiro",
    explicacao: "Juros, tarifas e rendimentos. Entrada vira receita financeira; saída, despesa financeira.",
  },
  nao_operacional: { rotulo: "Não operacional", explicacao: "O que não vem da operação, como venda de um bem." },
  transferencia: {
    rotulo: "Fora do resultado",
    explicacao: "Dinheiro que se move sem virar receita nem despesa: transferências e amortização de dívida.",
  },
};

const ORDEM_DOS_GRUPOS: readonly GrupoDre[] = [
  "receita_bruta",
  "deducao",
  "custo",
  "despesa_operacional",
  "resultado_financeiro",
  "nao_operacional",
  "transferencia",
];

interface LinhaCrua extends Record<string, unknown> {
  conta_id: string;
  codigo: string;
  conta_nome: string;
  grupo: string;
  conta_ativa: boolean;
  categoria_id: string | null;
  categoria_nome: string | null;
  categoria_ativa: boolean | null;
  usos: string | null;
}

export class RepositorioPlanoContasDrizzle implements RepositorioPlanoContas {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async montar(escopo: EscopoEmpresa): Promise<PlanoDeContas> {
    const linhas = await this.banco.execute<LinhaCrua>(sql`
      SELECT p.id::text AS conta_id, p.codigo, p.nome AS conta_nome, p.grupo_dre::text AS grupo, p.ativa AS conta_ativa,
             c.id::text AS categoria_id, c.nome AS categoria_nome, c.ativa AS categoria_ativa,
             CASE WHEN c.id IS NULL THEN NULL ELSE (${consultaDeUsos()})::text END AS usos
      FROM contas_plano p
      LEFT JOIN categorias_financeiras c ON c.conta_plano_id = p.id AND c.empresa_id = p.empresa_id
      WHERE p.empresa_id = ${escopo.empresaId}
      ORDER BY p.codigo, c.nome
    `);

    const porConta = new Map<string, { conta: Omit<ContaDoPlano, "categorias" | "podeExcluir">; categorias: CategoriaDoPlano[] }>();
    for (const linha of linhas) {
      let entrada = porConta.get(linha.conta_id);
      if (!entrada) {
        entrada = {
          conta: {
            id: linha.conta_id,
            codigo: linha.codigo,
            nome: linha.conta_nome,
            grupoDre: linha.grupo as GrupoDre,
            ativa: linha.conta_ativa,
          },
          categorias: [],
        };
        porConta.set(linha.conta_id, entrada);
      }
      if (linha.categoria_id) {
        const usos = Number(linha.usos ?? "0");
        entrada.categorias.push({
          id: linha.categoria_id,
          nome: linha.categoria_nome!,
          ativa: linha.categoria_ativa!,
          usos,
          podeExcluir: usos === 0,
        });
      }
    }

    const contas: ContaDoPlano[] = [...porConta.values()].map(({ conta, categorias }) => ({
      ...conta,
      categorias,
      podeExcluir: categorias.length === 0,
    }));

    const grupos: GrupoDoPlano[] = ORDEM_DOS_GRUPOS.map((grupo) => ({
      grupo,
      rotulo: ROTULO_DO_GRUPO[grupo].rotulo,
      explicacao: ROTULO_DO_GRUPO[grupo].explicacao,
      contas: contas.filter((conta) => conta.grupoDre === grupo),
    })).filter((grupo) => grupo.contas.length > 0);

    return {
      grupos,
      totalContas: contas.length,
      totalCategorias: contas.reduce((soma, conta) => soma + conta.categorias.length, 0),
      linhasSemCategoria: linhasSemCategoriaAtiva(contas),
      categoriasForaDoResultado: contas
        .filter((conta) => conta.grupoDre === "transferencia")
        .flatMap((conta) => conta.categorias.filter((c) => c.ativa).map((c) => ({ nome: c.nome, contaNome: conta.nome }))),
    };
  }

  // ------------------------------------------------------------------ contas

  async criarConta(escopo: EscopoEmpresa, dados: DadosDaConta, usuarioId: string): Promise<{ contaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [criada] = await transacao
        .insert(contasPlano)
        .values({ empresaId: escopo.empresaId, codigo: dados.codigo, nome: dados.nome, grupoDre: dados.grupoDre })
        .returning({ id: contasPlano.id });

      await this.registrar(transacao, escopo, usuarioId, "conta_plano.criada", criada!.id, { ...dados });
      return { contaId: criada!.id };
    }, this.banco);
  }

  async editarConta(escopo: EscopoEmpresa, contaId: string, dados: DadosDaConta, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.contaOuErro(transacao, escopo, contaId);
      await transacao
        .update(contasPlano)
        .set({ codigo: dados.codigo, nome: dados.nome, grupoDre: dados.grupoDre, atualizadoEm: new Date() })
        .where(and(eq(contasPlano.id, contaId), eq(contasPlano.empresaId, escopo.empresaId)));

      /*
       * Mudar o GRUPO reclassifica todo o historico daquela conta: os
       * lancamentos antigos passam a cair em outra linha do demonstrativo.
       * Nao e erro — e as vezes e justamente a correcao desejada —, mas fica
       * registrado com o antes e o depois, porque explica um Resultados que
       * "mudou sozinho".
       */
      await this.registrar(transacao, escopo, usuarioId, "conta_plano.editada", contaId, { ...dados }, {
        codigo: antes.codigo,
        nome: antes.nome,
        grupoDre: antes.grupoDre,
      });
    }, this.banco);
  }

  async alterarSituacaoConta(escopo: EscopoEmpresa, contaId: string, ativa: boolean, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.contaOuErro(transacao, escopo, contaId);
      await transacao
        .update(contasPlano)
        .set({ ativa, atualizadoEm: new Date() })
        .where(and(eq(contasPlano.id, contaId), eq(contasPlano.empresaId, escopo.empresaId)));

      /*
       * Inativar a conta inativa as categorias dela: deixar categoria ativa
       * sob conta inativa produziria um lancamento que chega ao demonstrativo
       * por uma conta que o usuario acredita ter desligado.
       */
      if (!ativa) {
        await transacao
          .update(categoriasFinanceiras)
          .set({ ativa: false, atualizadoEm: new Date() })
          .where(and(eq(categoriasFinanceiras.contaPlanoId, contaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)));
      }

      await this.registrar(transacao, escopo, usuarioId, ativa ? "conta_plano.reativada" : "conta_plano.inativada", contaId, { ativa }, { ativa: antes.ativa });
    }, this.banco);
  }

  async excluirConta(escopo: EscopoEmpresa, contaId: string, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const conta = await this.contaOuErro(transacao, escopo, contaId);
      const [contagem] = await transacao.execute<{ n: string }>(sql`
        SELECT count(*)::text AS n FROM categorias_financeiras
        WHERE conta_plano_id = ${contaId} AND empresa_id = ${escopo.empresaId}
      `);
      const categorias = Number(contagem!.n);
      if (categorias > 0) throw new ContaEmUso(conta.nome, categorias);

      await transacao.delete(contasPlano).where(and(eq(contasPlano.id, contaId), eq(contasPlano.empresaId, escopo.empresaId)));
      await this.registrar(transacao, escopo, usuarioId, "conta_plano.excluida", contaId, null, { codigo: conta.codigo, nome: conta.nome });
    }, this.banco);
  }

  // -------------------------------------------------------------- categorias

  async criarCategoria(escopo: EscopoEmpresa, dados: DadosDaCategoria, usuarioId: string): Promise<{ categoriaId: string }> {
    return executarEmTransacao(async (transacao) => {
      await this.contaOuErro(transacao, escopo, dados.contaPlanoId);
      const [criada] = await transacao
        .insert(categoriasFinanceiras)
        .values({ empresaId: escopo.empresaId, nome: dados.nome, contaPlanoId: dados.contaPlanoId })
        .returning({ id: categoriasFinanceiras.id });

      await this.registrar(transacao, escopo, usuarioId, "categoria.criada", criada!.id, { ...dados });
      return { categoriaId: criada!.id };
    }, this.banco);
  }

  async editarCategoria(escopo: EscopoEmpresa, categoriaId: string, dados: DadosDaCategoria, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.categoriaOuErro(transacao, escopo, categoriaId);
      await this.contaOuErro(transacao, escopo, dados.contaPlanoId);

      await transacao
        .update(categoriasFinanceiras)
        .set({ nome: dados.nome, contaPlanoId: dados.contaPlanoId, atualizadoEm: new Date() })
        .where(and(eq(categoriasFinanceiras.id, categoriaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)));

      await this.registrar(transacao, escopo, usuarioId, "categoria.editada", categoriaId, { ...dados }, {
        nome: antes.nome,
        contaPlanoId: antes.contaPlanoId,
      });
    }, this.banco);
  }

  async alterarSituacaoCategoria(escopo: EscopoEmpresa, categoriaId: string, ativa: boolean, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.categoriaOuErro(transacao, escopo, categoriaId);
      await transacao
        .update(categoriasFinanceiras)
        .set({ ativa, atualizadoEm: new Date() })
        .where(and(eq(categoriasFinanceiras.id, categoriaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)));

      await this.registrar(transacao, escopo, usuarioId, ativa ? "categoria.reativada" : "categoria.inativada", categoriaId, { ativa }, { ativa: antes.ativa });
    }, this.banco);
  }

  async excluirCategoria(escopo: EscopoEmpresa, categoriaId: string, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const categoria = await this.categoriaOuErro(transacao, escopo, categoriaId);
      const [contagem] = await transacao.execute<{ usos: string }>(sql`
        SELECT (${consultaDeUsos()})::text AS usos
        FROM categorias_financeiras c
        WHERE c.id = ${categoriaId} AND c.empresa_id = ${escopo.empresaId}
      `);
      const usos = Number(contagem?.usos ?? "0");
      if (usos > 0) throw new CategoriaEmUso(categoria.nome, usos);

      await transacao
        .delete(categoriasFinanceiras)
        .where(and(eq(categoriasFinanceiras.id, categoriaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)));
      await this.registrar(transacao, escopo, usuarioId, "categoria.excluida", categoriaId, null, { nome: categoria.nome });
    }, this.banco);
  }

  // ------------------------------------------------------------------ apoio

  private async contaOuErro(executor: ExecutorBancoDados, escopo: EscopoEmpresa, contaId: string) {
    const [conta] = await executor
      .select({ id: contasPlano.id, codigo: contasPlano.codigo, nome: contasPlano.nome, grupoDre: contasPlano.grupoDre, ativa: contasPlano.ativa })
      .from(contasPlano)
      .where(and(eq(contasPlano.id, contaId), eq(contasPlano.empresaId, escopo.empresaId)))
      .limit(1);
    if (!conta) throw new ItemDoPlanoNaoEncontrado("conta");
    return conta;
  }

  private async categoriaOuErro(executor: ExecutorBancoDados, escopo: EscopoEmpresa, categoriaId: string) {
    const [categoria] = await executor
      .select({ id: categoriasFinanceiras.id, nome: categoriasFinanceiras.nome, contaPlanoId: categoriasFinanceiras.contaPlanoId, ativa: categoriasFinanceiras.ativa })
      .from(categoriasFinanceiras)
      .where(and(eq(categoriasFinanceiras.id, categoriaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)))
      .limit(1);
    if (!categoria) throw new ItemDoPlanoNaoEncontrado("categoria");
    return categoria;
  }

  private async registrar(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    usuarioId: string,
    acao: string,
    entidadeId: string,
    dadosDepois: Record<string, unknown> | null,
    dadosAntes?: Record<string, unknown>,
  ) {
    await new RegistradorAuditoriaDrizzle(executor).registrar({
      acao,
      entidade: acao.startsWith("conta_plano") ? "conta_plano" : "categoria_financeira",
      entidadeId,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(usuarioId),
      origem: "interface",
      ...(dadosAntes ? { dadosAntes } : {}),
      ...(dadosDepois ? { dadosDepois } : {}),
    });
  }
}

/**
 * Linhas do demonstrativo que nenhuma categoria ATIVA alcanca.
 *
 * Considera os dois sentidos do lancamento, porque o grupo
 * `resultado_financeiro` alimenta duas linhas conforme entrada ou saida.
 */
function linhasSemCategoriaAtiva(contas: readonly ContaDoPlano[]): { linha: LinhaDre; rotulo: string }[] {
  const alcancadas = new Set<LinhaDre>();
  for (const conta of contas) {
    if (!conta.ativa || !conta.categorias.some((categoria) => categoria.ativa)) continue;
    for (const tipo of ["entrada", "saida"] as const) {
      const linha = linhaDoLancamento(conta.grupoDre, tipo);
      if (linha) alcancadas.add(linha);
    }
  }

  return ESTRUTURA_DRE.filter(
    (definicao) =>
      !definicao.ehSubtotal &&
      // Descontos vem das BAIXAS, nunca de categoria: cobra-los aqui seria
      // pedir ao usuario algo que ele nao tem como fazer.
      definicao.linha !== "descontos_concedidos" &&
      definicao.linha !== "descontos_obtidos" &&
      !alcancadas.has(definicao.linha),
  ).map((definicao) => ({ linha: definicao.linha, rotulo: definicao.rotulo }));
}
