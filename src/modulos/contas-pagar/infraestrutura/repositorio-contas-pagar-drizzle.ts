import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { hojeDataCivil, type DataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import { saldoRestante, situacaoDerivada, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { deslocamento, type EscopoEmpresa, type PaginaResultado, type Paginacao } from "@/compartilhado/tipos/indice";
import { contasBancarias, movimentacoesBancarias } from "@/modulos/bancos/infraestrutura/esquema";
import { fornecedores, pessoas } from "@/modulos/cadastros/infraestrutura/esquema";
import { categoriasFinanceiras } from "@/modulos/plano-contas/infraestrutura/esquema";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type BancoDados, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { formatarCodigo, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";

import type {
  ContaPagarDetalhada,
  ContaPagarNaLista,
  DadosEdicaoContaPagar,
  DadosNovaContaPagar,
  DadosPagamento,
  FiltroContasPagar,
  PagamentoRegistrado,
  RepositorioContasPagar,
} from "../aplicacao/repositorio-contas-pagar";
import { pagamentos, parcelasPagar, titulosPagar } from "./esquema";

/**
 * Contas a pagar no PostgreSQL.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`, sempre. Como a
 * ADR-017 decidiu nao usar seguranca por linha, este filtro e a unica barreira
 * entre empresas — por isso ele aparece em TODA clausula `where`, inclusive
 * nas buscas por id. Provado em `repositorio-contas-pagar.isolamento.teste.ts`.
 *
 * Uma "conta a pagar" na interface e um titulo com UMA parcela. O modelo
 * suporta N parcelas (carne, parcelamento); a tela do Gate 5 cria sempre uma,
 * e as consultas ja leem por parcela para que o parcelamento entre depois sem
 * reescrever nada.
 */
export class RepositorioContasPagarDrizzle implements RepositorioContasPagar {
  constructor(private readonly banco: BancoDados) {}

  async listar(
    escopo: EscopoEmpresa,
    filtro: FiltroContasPagar,
    paginacao: Paginacao,
    hoje: DataCivil,
  ): Promise<PaginaResultado<ContaPagarNaLista>> {
    const condicoes = this.condicoesDeBusca(escopo, filtro);

    const linhas = await this.banco
      .select(this.colunasDaLista())
      .from(parcelasPagar)
      .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
      .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosPagar.categoriaId))
      .where(and(...condicoes))
      .orderBy(parcelasPagar.dataVencimento, titulosPagar.codigo)
      .limit(paginacao.tamanho)
      .offset(deslocamento(paginacao));

    const itens = linhas.map((linha) => this.montarItem(linha, hoje));
    // A situacao e derivada, entao o filtro por situacao acontece depois de
    // calcular. Paginar por cima disso mentiria na contagem; por isso o total
    // vem de uma contagem propria quando nao ha filtro de situacao.
    const filtrados = filtro.situacoes?.length ? itens.filter((item) => filtro.situacoes!.includes(item.situacao)) : itens;

    const [contagem] = await this.banco
      .select({ total: sql<number>`count(*)::int` })
      .from(parcelasPagar)
      .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
      .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .where(and(...condicoes));

    return { itens: filtrados, total: contagem?.total ?? 0, pagina: paginacao.pagina, tamanho: paginacao.tamanho };
  }

  async buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaPagarDetalhada | null> {
    const [linha] = await this.banco
      .select({
        ...this.colunasDaLista(),
        fornecedorId: titulosPagar.fornecedorId,
        categoriaId: titulosPagar.categoriaId,
        dataCompetencia: titulosPagar.dataCompetencia,
        observacoes: parcelasPagar.observacoes,
      })
      .from(parcelasPagar)
      .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
      .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosPagar.categoriaId))
      // O filtro por empresa vem junto do id: saber o UUID nao basta.
      .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
      .limit(1);

    if (!linha) return null;

    const historico = await this.banco
      .select({
        id: pagamentos.id,
        dataPagamento: pagamentos.dataPagamento,
        valorPrincipal: pagamentos.valorPrincipal,
        valorJuros: pagamentos.valorJuros,
        valorMulta: pagamentos.valorMulta,
        valorDesconto: pagamentos.valorDesconto,
        valorPago: pagamentos.valorPago,
        formaPagamento: pagamentos.formaPagamento,
        contaBancariaNome: contasBancarias.nome,
        situacao: pagamentos.situacao,
      })
      .from(pagamentos)
      .innerJoin(contasBancarias, eq(contasBancarias.id, pagamentos.contaBancariaId))
      .where(and(eq(pagamentos.parcelaPagarId, parcelaId), eq(pagamentos.empresaId, escopo.empresaId)))
      .orderBy(desc(pagamentos.dataPagamento), desc(pagamentos.criadoEm));

    return {
      ...this.montarItem(linha, hoje),
      fornecedorId: linha.fornecedorId,
      categoriaId: linha.categoriaId,
      dataCompetencia: linha.dataCompetencia as DataCivil,
      observacoes: linha.observacoes,
      pagamentos: historico.map(
        (p): PagamentoRegistrado => ({
          id: p.id,
          dataPagamento: p.dataPagamento as DataCivil,
          valorPrincipal: Dinheiro.deTexto(p.valorPrincipal),
          valorJuros: Dinheiro.deTexto(p.valorJuros),
          valorMulta: Dinheiro.deTexto(p.valorMulta),
          valorDesconto: Dinheiro.deTexto(p.valorDesconto),
          valorPago: Dinheiro.deTexto(p.valorPago),
          formaPagamento: p.formaPagamento,
          contaBancariaNome: p.contaBancariaNome,
          estornado: p.situacao === "estornado",
        }),
      ),
    };
  }

  /** Titulo + parcela nascem juntos, ou nenhum dos dois nasce. */
  async criar(escopo: EscopoEmpresa, dados: DadosNovaContaPagar, usuarioId: string): Promise<{ parcelaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const codigo = await this.proximoCodigo(transacao, escopo, dados.dataCompetencia);

      const [titulo] = await transacao
        .insert(titulosPagar)
        .values({
          empresaId: escopo.empresaId,
          codigo,
          fornecedorId: dados.fornecedorId,
          descricao: dados.descricao,
          dataCompetencia: dados.dataCompetencia,
          valorTotal: dados.valor.paraTexto(),
          quantidadeParcelas: 1,
          categoriaId: dados.categoriaId,
          situacao: "aberto",
          criadoPorUsuarioId: usuarioId,
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: titulosPagar.id });

      const [parcela] = await transacao
        .insert(parcelasPagar)
        .values({
          tituloPagarId: titulo!.id,
          empresaId: escopo.empresaId,
          numeroParcela: 1,
          dataVencimento: dados.dataVencimento,
          valorOriginal: dados.valor.paraTexto(),
          situacao: "aberta",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: parcelasPagar.id });

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.criada",
        entidade: "titulo_pagar",
        entidadeId: titulo!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: { codigo, descricao: dados.descricao, valor: dados.valor.paraTexto(), vencimento: dados.dataVencimento },
      });

      return { parcelaId: parcela!.id };
    }, this.banco);
  }

  async editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaPagar): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({ id: parcelasPagar.id, tituloId: parcelasPagar.tituloPagarId })
        .from(parcelasPagar)
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
        .limit(1);
      if (!parcela) return;

      await transacao
        .update(parcelasPagar)
        .set({ dataVencimento: dados.dataVencimento, valorOriginal: dados.valor.paraTexto(), observacoes: dados.observacoes ?? null, atualizadoEm: new Date() })
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)));

      await transacao
        .update(titulosPagar)
        .set({ descricao: dados.descricao, categoriaId: dados.categoriaId, valorTotal: dados.valor.paraTexto(), atualizadoEm: new Date() })
        .where(and(eq(titulosPagar.id, parcela.tituloId), eq(titulosPagar.empresaId, escopo.empresaId)));
    }, this.banco);
  }

  /**
   * Pagamento, movimentacao bancaria e novo saldo da parcela: uma transacao so.
   *
   * A parcela e travada com SELECT ... FOR UPDATE antes de qualquer conta. Sem
   * isso, dois cliques simultaneos no botao "Registrar pagamento" leriam o
   * mesmo saldo e gravariam duas baixas — a conta ficaria paga em dobro, com
   * duas saidas reais de dinheiro.
   */
  async registrarPagamento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosPagamento): Promise<{ pagamentoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({
          id: parcelasPagar.id,
          tituloId: parcelasPagar.tituloPagarId,
          valorOriginal: parcelasPagar.valorOriginal,
          valorPago: parcelasPagar.valorPago,
          situacao: parcelasPagar.situacao,
        })
        .from(parcelasPagar)
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

      const original = Dinheiro.deTexto(parcela.valorOriginal);
      const jaPago = Dinheiro.deTexto(parcela.valorPago);
      const saldo = saldoRestante({ valorOriginal: original, valorBaixado: jaPago });

      // Revalida DENTRO da transacao, com a linha travada: o saldo lido pela
      // tela pode estar velho.
      if (parcela.situacao !== "aberta") throw new Error("PARCELA_NAO_ESTA_ABERTA");
      if (!dados.valorPrincipal.ehPositivo()) throw new Error("VALOR_INVALIDO");
      if (dados.valorPrincipal.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

      const [titulo] = await transacao
        .select({ descricao: titulosPagar.descricao, codigo: titulosPagar.codigo, categoriaId: titulosPagar.categoriaId })
        .from(titulosPagar)
        .where(and(eq(titulosPagar.id, parcela.tituloId), eq(titulosPagar.empresaId, escopo.empresaId)))
        .limit(1);

      // A conta bancaria precisa ser DESTA empresa: sem esta checagem, pagar
      // com a conta de outra empresa seria possivel informando o UUID.
      const [conta] = await transacao
        .select({ id: contasBancarias.id })
        .from(contasBancarias)
        .where(and(eq(contasBancarias.id, dados.contaBancariaId), eq(contasBancarias.empresaId, escopo.empresaId)))
        .limit(1);
      if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");

      const totalPago = dados.valorPrincipal.somar(dados.valorJuros).somar(dados.valorMulta).subtrair(dados.valorDesconto);
      if (!totalPago.ehPositivo()) throw new Error("VALOR_INVALIDO");

      const [movimentacao] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaId,
          dataMovimentacao: dados.dataPagamento,
          tipo: "saida",
          valor: totalPago.paraTexto(),
          descricao: `${titulo?.codigo ?? "CP"} · ${titulo?.descricao ?? "Pagamento"}`,
          origem: "pagamento",
          ...(titulo?.categoriaId ? { categoriaId: titulo.categoriaId } : {}),
        })
        .returning({ id: movimentacoesBancarias.id });

      const [pagamento] = await transacao
        .insert(pagamentos)
        .values({
          parcelaPagarId: parcelaId,
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaId,
          movimentacaoBancariaId: movimentacao!.id,
          dataPagamento: dados.dataPagamento,
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          valorJuros: dados.valorJuros.paraTexto(),
          valorMulta: dados.valorMulta.paraTexto(),
          valorDesconto: dados.valorDesconto.paraTexto(),
          valorPago: totalPago.paraTexto(),
          formaPagamento: dados.formaPagamento as "pix",
          situacao: "registrado",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: pagamentos.id });

      const novoPago = jaPago.somar(dados.valorPrincipal);
      const quitada = !novoPago.menorQue(original);
      await transacao
        .update(parcelasPagar)
        .set({ valorPago: novoPago.paraTexto(), situacao: quitada ? "liquidada" : "aberta", atualizadoEm: new Date() })
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.paga",
        entidade: "parcela_pagar",
        entidadeId: parcelaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          valorPago: totalPago.paraTexto(),
          data: dados.dataPagamento,
          quitada,
        },
      });

      return { pagamentoId: pagamento!.id };
    }, this.banco);
  }

  // ---- apoio ----

  private colunasDaLista() {
    return {
      parcelaId: parcelasPagar.id,
      tituloId: parcelasPagar.tituloPagarId,
      codigo: titulosPagar.codigo,
      descricao: titulosPagar.descricao,
      fornecedorNome: pessoas.nome,
      categoriaNome: categoriasFinanceiras.nome,
      dataVencimento: parcelasPagar.dataVencimento,
      valorOriginal: parcelasPagar.valorOriginal,
      valorPago: parcelasPagar.valorPago,
      situacaoParcela: parcelasPagar.situacao,
    };
  }

  private montarItem(linha: Record<string, unknown>, hoje: DataCivil): ContaPagarNaLista {
    const valorOriginal = Dinheiro.deTexto(String(linha.valorOriginal));
    const valorPago = Dinheiro.deTexto(String(linha.valorPago));
    const parcela = {
      valorOriginal,
      valorBaixado: valorPago,
      dataVencimento: String(linha.dataVencimento) as DataVencimento,
      situacaoGravada: String(linha.situacaoParcela) as "aberta" | "liquidada" | "cancelada" | "perdida",
    };
    return {
      parcelaId: String(linha.parcelaId),
      tituloId: String(linha.tituloId),
      codigo: String(linha.codigo),
      descricao: String(linha.descricao),
      fornecedorNome: String(linha.fornecedorNome),
      categoriaNome: String(linha.categoriaNome),
      dataVencimento: parcela.dataVencimento,
      valorOriginal,
      valorPago,
      saldo: saldoRestante(parcela),
      situacao: situacaoDerivada(parcela, hoje) as SituacaoDerivada,
    };
  }

  private condicoesDeBusca(escopo: EscopoEmpresa, filtro: FiltroContasPagar): SQL[] {
    const condicoes: SQL[] = [eq(parcelasPagar.empresaId, escopo.empresaId)];
    if (filtro.busca) {
      const alvo = `%${filtro.busca}%`;
      const busca = or(ilike(titulosPagar.descricao, alvo), ilike(titulosPagar.codigo, alvo), ilike(pessoas.nome, alvo));
      if (busca) condicoes.push(busca);
    }
    if (filtro.vencimentoDe) condicoes.push(gte(parcelasPagar.dataVencimento, filtro.vencimentoDe));
    if (filtro.vencimentoAte) condicoes.push(lte(parcelasPagar.dataVencimento, filtro.vencimentoAte));
    if (filtro.fornecedorId) condicoes.push(eq(titulosPagar.fornecedorId, filtro.fornecedorId));
    if (filtro.categoriaId) condicoes.push(eq(titulosPagar.categoriaId, filtro.categoriaId));
    return condicoes;
  }

  private async proximoCodigo(transacao: ExecutorBancoDados, escopo: EscopoEmpresa, competencia: DataCivil): Promise<string> {
    const ano = Number(competencia.slice(0, 4));
    const [linha] = await transacao.execute<{ proximo: number }>(sql`
      INSERT INTO sequencias_codigo (empresa_id, prefixo, ano, ultimo_numero)
      VALUES (${escopo.empresaId}, ${PREFIXOS_CODIGO.contaPagar}, ${ano}, 1)
      ON CONFLICT (empresa_id, prefixo, ano) DO UPDATE SET ultimo_numero = sequencias_codigo.ultimo_numero + 1
      RETURNING ultimo_numero AS proximo
    `);
    return formatarCodigo(PREFIXOS_CODIGO.contaPagar, ano, Number(linha?.proximo ?? 1));
  }
}

/** Data de hoje no fuso da empresa. A tela nunca decide "hoje" sozinha. */
export function hojeDaEmpresa(fusoHorario: string): DataCivil {
  return hojeDataCivil(fusoHorario);
}
