import { and, asc, eq, sql } from "drizzle-orm";

import { criarDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/* Tabelas de outros modulos vem do agregador: esquema nao e interface publica. */
import { categoriasFinanceiras, contasPlano } from "@/banco-dados/esquemas/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
/* O realizado vem do modulo de Resultados, sempre pela porta da frente. */
import { RepositorioDreDrizzle, type Regime } from "@/modulos/dre/publico";

import {
  anoZerado,
  compararComOOrcado,
  MESES_DO_ANO,
  naturezaDoGrupo,
  somaDoAno,
  type NaturezaOrcada,
  type ValoresDoAno,
} from "../dominio/planilha-do-orcamento";
import { itensOrcamento, orcamentos } from "./esquema";
import type {
  AcompanhamentoDoOrcamento,
  GrupoDoAcompanhamento,
  LinhaDoAcompanhamento,
  Planejamento,
  RepositorioOrcamento,
  ValorPlanejado,
} from "../aplicacao/repositorio-orcamento";

/**
 * Orcamento anual no PostgreSQL.
 *
 * ----------------------------------------------------------------------
 * UMA VERSAO POR ANO
 *
 * O modelo permite varios orcamentos por ano (a unicidade e por nome). Este
 * gate trabalha com UM so, encontrado ou criado pelo nome padrao. Cenarios
 * multiplos ("otimista" e "pessimista") cabem no modelo e ficam para depois.
 *
 * ----------------------------------------------------------------------
 * O REALIZADO NAO MORA AQUI
 *
 * Ele vem de `RepositorioDreDrizzle`, a mesma fonte da tela de Resultados,
 * respeitando o regime escolhido. Recalcular "so o realizado do orcamento"
 * criaria dois numeros para a mesma pergunta, e nenhuma forma de saber qual
 * acreditar quando discordassem.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`.
 */
export class RepositorioOrcamentoDrizzle implements RepositorioOrcamento {
  constructor(private readonly banco: ExecutorBancoDados) {}

  private nomeDoAno(ano: number): string {
    return `Orçamento ${ano}`;
  }

  async planejamento(escopo: EscopoEmpresa, ano: number): Promise<Planejamento> {
    const [categorias, gravados, orcamento] = await Promise.all([
      this.categoriasDaEmpresa(escopo),
      this.itensGravados(escopo, ano),
      this.orcamentoDoAno(escopo, ano),
    ]);

    const linhas = categorias.map((categoria) => {
      const porMes = anoZerado().map((zero, indice) => gravados.get(`${categoria.id}|${indice + 1}`) ?? zero);
      return {
        categoriaId: categoria.id,
        categoriaNome: categoria.nome,
        grupoDre: categoria.grupo,
        natureza: naturezaDoGrupo(categoria.grupo),
        porMes,
        total: somaDoAno(porMes),
      };
    });

    return {
      ano,
      orcamentoId: orcamento?.id ?? null,
      linhas,
      total: Dinheiro.somarTodos(linhas.map((linha) => linha.total)),
    };
  }

  /**
   * Grava a grade inteira numa transacao so.
   *
   * Celula zerada e APAGADA em vez de gravada como zero: "nao orcado" e
   * diferente de "orcado em zero". A primeira nao gera estouro; a segunda
   * geraria a cada centavo gasto.
   */
  async salvarPlanejamento(
    escopo: EscopoEmpresa,
    ano: number,
    valores: readonly ValorPlanejado[],
    usuarioId: string,
  ): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [orcamento] = await transacao
        .insert(orcamentos)
        .values({ empresaId: escopo.empresaId, nome: this.nomeDoAno(ano), ano, situacao: "ativo" })
        .onConflictDoUpdate({
          target: [orcamentos.empresaId, orcamentos.ano, orcamentos.nome],
          set: { situacao: "ativo", atualizadoEm: new Date() },
        })
        .returning({ id: orcamentos.id });

      const validos = valores.filter((valor) => valor.mes >= 1 && valor.mes <= MESES_DO_ANO);
      const naoVazios = validos.filter((valor) => valor.valor.ehPositivo());

      // Toda a grade e reescrita: o que nao veio no envio deixa de existir.
      await transacao.delete(itensOrcamento).where(eq(itensOrcamento.orcamentoId, orcamento!.id));

      if (naoVazios.length > 0) {
        await transacao.insert(itensOrcamento).values(
          naoVazios.map((valor) => ({
            orcamentoId: orcamento!.id,
            competencia: criarDataCivil(ano, valor.mes, 1),
            categoriaId: valor.categoriaId,
            valorPlanejado: valor.valor.paraTexto(),
          })),
        );
      }

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "orcamento.planejado",
        entidade: "orcamento",
        entidadeId: orcamento!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: {
          ano,
          celulas: naoVazios.length,
          total: Dinheiro.somarTodos(naoVazios.map((valor) => valor.valor)).paraTexto(),
        },
      });
    }, this.banco);
  }

  async acompanhar(
    escopo: EscopoEmpresa,
    ano: number,
    mes: number,
    regime: Regime,
    hoje: DataCivil,
  ): Promise<AcompanhamentoDoOrcamento> {
    const [planejado, realizado] = await Promise.all([
      this.planejamento(escopo, ano),
      this.realizadoDoAno(escopo, ano, regime, hoje),
    ]);

    const mesValido = Math.min(Math.max(mes, 1), MESES_DO_ANO);

    const linhas: LinhaDoAcompanhamento[] = planejado.linhas
      .filter((linha) => linha.natureza !== null)
      .map((linha) => {
        const realizadoPorMes = realizado.get(linha.categoriaId) ?? anoZerado();
        const natureza = linha.natureza as NaturezaOrcada;
        const ate = (valores: ValoresDoAno) => Dinheiro.somarTodos([...valores].slice(0, mesValido));
        return {
          categoriaId: linha.categoriaId,
          categoriaNome: linha.categoriaNome,
          grupoDre: linha.grupoDre,
          natureza,
          planejadoPorMes: linha.porMes,
          realizadoPorMes,
          noMes: compararComOOrcado(linha.porMes[mesValido - 1]!, realizadoPorMes[mesValido - 1]!, natureza),
          acumulado: compararComOOrcado(ate(linha.porMes), ate(realizadoPorMes), natureza),
        };
      })
      // Categoria sem planejamento e sem realizado nao vira linha: a grade
      // inteira do plano de contas deixaria a tela ilegivel.
      .filter((linha) => !linha.acumulado.planejado.ehZero() || !linha.acumulado.realizado.ehZero());

    const grupos = agruparPorGrupo(linhas);
    const somar = (filtro: (linha: LinhaDoAcompanhamento) => boolean, campo: "noMes" | "acumulado", natureza: NaturezaOrcada) => {
      const escolhidas = linhas.filter(filtro);
      return compararComOOrcado(
        Dinheiro.somarTodos(escolhidas.map((linha) => linha[campo].planejado)),
        Dinheiro.somarTodos(escolhidas.map((linha) => linha[campo].realizado)),
        natureza,
      );
    };
    const ehReceita = (linha: LinhaDoAcompanhamento) => linha.natureza === "receita";
    const ehDespesa = (linha: LinhaDoAcompanhamento) => linha.natureza === "despesa";

    return {
      ano,
      mes: mesValido,
      regime,
      grupos,
      receitaNoMes: somar(ehReceita, "noMes", "receita"),
      despesaNoMes: somar(ehDespesa, "noMes", "despesa"),
      receitaAcumulada: somar(ehReceita, "acumulado", "receita"),
      despesaAcumulada: somar(ehDespesa, "acumulado", "despesa"),
      estouros: linhas
        .filter((linha) => linha.noMes.estourou)
        .sort((a, b) => b.noMes.diferenca.absoluto().comparar(a.noMes.diferenca.absoluto())),
      temPlanejamento: planejado.linhas.some((linha) => !linha.total.ehZero()),
    };
  }

  async planejadoDoAnoAnterior(escopo: EscopoEmpresa, ano: number): Promise<readonly ValorPlanejado[]> {
    const gravados = await this.itensGravados(escopo, ano - 1);
    return [...gravados.entries()].map(([chave, valor]) => {
      const [categoriaId, mes] = chave.split("|");
      return { categoriaId: categoriaId!, mes: Number(mes), valor };
    });
  }

  async realizadoDoAnoAnterior(
    escopo: EscopoEmpresa,
    ano: number,
    regime: Regime,
    hoje: DataCivil,
  ): Promise<readonly ValorPlanejado[]> {
    const realizado = await this.realizadoDoAno(escopo, ano - 1, regime, hoje);
    const valores: ValorPlanejado[] = [];
    for (const [categoriaId, porMes] of realizado) {
      porMes.forEach((valor, indice) => {
        if (valor.ehPositivo()) valores.push({ categoriaId, mes: indice + 1, valor });
      });
    }
    return valores;
  }

  // ---------------------------------------------------------------- apoio

  private async orcamentoDoAno(escopo: EscopoEmpresa, ano: number) {
    const [linha] = await this.banco
      .select({ id: orcamentos.id })
      .from(orcamentos)
      .where(and(eq(orcamentos.empresaId, escopo.empresaId), eq(orcamentos.ano, ano), eq(orcamentos.nome, this.nomeDoAno(ano))))
      .limit(1);
    return linha;
  }

  private async categoriasDaEmpresa(escopo: EscopoEmpresa) {
    return this.banco
      .select({
        id: categoriasFinanceiras.id,
        nome: categoriasFinanceiras.nome,
        grupo: sql<string | null>`${contasPlano.grupoDre}::text`,
      })
      .from(categoriasFinanceiras)
      .leftJoin(contasPlano, eq(contasPlano.id, categoriasFinanceiras.contaPlanoId))
      .where(and(eq(categoriasFinanceiras.empresaId, escopo.empresaId), eq(categoriasFinanceiras.ativa, true)))
      .orderBy(asc(contasPlano.grupoDre), asc(categoriasFinanceiras.nome));
  }

  /** Chave `categoriaId|mes` (mes de 1 a 12) -> valor planejado. */
  private async itensGravados(escopo: EscopoEmpresa, ano: number): Promise<Map<string, Dinheiro>> {
    const linhas = await this.banco
      .select({
        categoriaId: itensOrcamento.categoriaId,
        competencia: itensOrcamento.competencia,
        valor: itensOrcamento.valorPlanejado,
      })
      .from(itensOrcamento)
      .innerJoin(orcamentos, eq(orcamentos.id, itensOrcamento.orcamentoId))
      .where(and(eq(orcamentos.empresaId, escopo.empresaId), eq(orcamentos.ano, ano)));

    const mapa = new Map<string, Dinheiro>();
    for (const linha of linhas) {
      const mes = Number(String(linha.competencia).slice(5, 7));
      mapa.set(`${linha.categoriaId}|${mes}`, Dinheiro.deTexto(linha.valor));
    }
    return mapa;
  }

  /**
   * O realizado do ano, por categoria e por mes, VINDO DO MODULO DE RESULTADOS.
   *
   * O DRE devolve as categorias ja classificadas por linha, com o sinal da
   * linha aplicado (despesa positiva numa linha de despesa). E exatamente o
   * que o orcamento precisa comparar.
   */
  private async realizadoDoAno(
    escopo: EscopoEmpresa,
    ano: number,
    regime: Regime,
    hoje: DataCivil,
  ): Promise<Map<string, ValoresDoAno>> {
    const dre = new RepositorioDreDrizzle(this.banco);
    const resultado = await dre.montar(
      escopo,
      { de: criarDataCivil(ano, 1, 1), ate: criarDataCivil(ano, 12, 31), regime },
      hoje,
    );

    const indiceDoMes = new Map(resultado.meses.map((mes, indice) => [Number(mes.competencia.slice(5, 7)), indice]));
    const porNome = new Map<string, Dinheiro[]>();

    for (const linha of resultado.linhas) {
      for (const categoria of linha.categorias) {
        const valores = porNome.get(categoria.categoriaNome) ?? [...anoZerado()];
        for (const [mes, indice] of indiceDoMes) {
          valores[mes - 1] = valores[mes - 1]!.somar(categoria.porMes[indice] ?? Dinheiro.zero());
        }
        porNome.set(categoria.categoriaNome, valores);
      }
    }

    /*
     * O DRE agrupa por NOME de categoria (e o que a tela mostra); o orcamento
     * grava por id. A traducao acontece aqui, com o nome como ponte — nomes de
     * categoria sao unicos por empresa (indice `unico_categorias_nome`).
     */
    const categorias = await this.categoriasDaEmpresa(escopo);
    const porId = new Map<string, ValoresDoAno>();
    for (const categoria of categorias) {
      const valores = porNome.get(categoria.nome);
      if (valores) porId.set(categoria.id, valores);
    }
    return porId;
  }
}

const ROTULOS_DE_GRUPO: Record<string, string> = {
  receita_bruta: "Receitas",
  deducao: "Deduções",
  custo: "Custos",
  despesa_operacional: "Despesas operacionais",
  resultado_financeiro: "Financeiras",
  nao_operacional: "Não operacional",
};

function agruparPorGrupo(linhas: readonly LinhaDoAcompanhamento[]): readonly GrupoDoAcompanhamento[] {
  const grupos = new Map<string, LinhaDoAcompanhamento[]>();
  for (const linha of linhas) {
    const chave = linha.grupoDre ?? "sem_grupo";
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }

  const ordem = ["receita_bruta", "deducao", "custo", "despesa_operacional", "resultado_financeiro", "nao_operacional"];

  return [...grupos.entries()]
    .sort(([a], [b]) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99))
    .map(([grupo, doGrupo]) => {
      const natureza = doGrupo[0]!.natureza;
      const total = (campo: "noMes" | "acumulado") =>
        compararComOOrcado(
          Dinheiro.somarTodos(doGrupo.map((linha) => linha[campo].planejado)),
          Dinheiro.somarTodos(doGrupo.map((linha) => linha[campo].realizado)),
          natureza,
        );
      return {
        grupo,
        rotulo: ROTULOS_DE_GRUPO[grupo] ?? "Sem grupo",
        natureza,
        linhas: [...doGrupo].sort((a, b) => b.acumulado.planejado.comparar(a.acumulado.planejado) || a.categoriaNome.localeCompare(b.categoriaNome)),
        noMes: total("noMes"),
        acumulado: total("acumulado"),
      };
    });
}
