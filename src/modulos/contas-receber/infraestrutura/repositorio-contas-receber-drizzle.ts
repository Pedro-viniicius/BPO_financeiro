import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import { hojeDataCivil, type DataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import { saldoRestante, situacaoDerivada, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { deslocamento, type EscopoEmpresa, type PaginaResultado, type Paginacao } from "@/compartilhado/tipos/indice";
/*
 * As tabelas de OUTROS modulos vem do agregador de esquemas, nunca do
 * `infraestrutura/esquema.ts` alheio: um modulo so conhece o outro pelo
 * `publico.ts`, e esquema nao e interface publica. O agregador existe
 * exatamente para as juncoes que cruzam modulos.
 */
import { categoriasFinanceiras, clientes, contasBancarias, movimentacoesBancarias, pessoas } from "@/banco-dados/esquemas/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type BancoDados, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { formatarCodigo, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";

import type {
  ContaReceberDetalhada,
  ContaReceberNaLista,
  DadosEdicaoContaReceber,
  DadosNovaContaReceber,
  DadosRecebimento,
  FiltroContasReceber,
  RecebimentoRegistrado,
  RepositorioContasReceber,
} from "../aplicacao/repositorio-contas-receber";
import { recebimentos, parcelasReceber, titulosReceber } from "./esquema";

/**
 * Contas a pagar no PostgreSQL.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`, sempre. Como a
 * ADR-017 decidiu nao usar seguranca por linha, este filtro e a unica barreira
 * entre empresas — por isso ele aparece em TODA clausula `where`, inclusive
 * nas buscas por id. Provado em `repositorio-contas-receber.isolamento.teste.ts`.
 *
 * Uma "conta a pagar" na interface e um titulo com UMA parcela. O modelo
 * suporta N parcelas (carne, parcelamento); a tela do Gate 5 cria sempre uma,
 * e as consultas ja leem por parcela para que o parcelamento entre depois sem
 * reescrever nada.
 */
export class RepositorioContasReceberDrizzle implements RepositorioContasReceber {
  constructor(private readonly banco: BancoDados) {}

  async listar(
    escopo: EscopoEmpresa,
    filtro: FiltroContasReceber,
    paginacao: Paginacao,
    hoje: DataCivil,
  ): Promise<PaginaResultado<ContaReceberNaLista>> {
    const condicoes = this.condicoesDeBusca(escopo, filtro);

    const linhas = await this.banco
      .select(this.colunasDaLista())
      .from(parcelasReceber)
      .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
      .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosReceber.categoriaId))
      .where(and(...condicoes))
      .orderBy(parcelasReceber.dataVencimento, titulosReceber.codigo)
      .limit(paginacao.tamanho)
      .offset(deslocamento(paginacao));

    const itens = linhas.map((linha) => this.montarItem(linha, hoje));
    // A situacao e derivada, entao o filtro por situacao acontece depois de
    // calcular. Paginar por cima disso mentiria na contagem; por isso o total
    // vem de uma contagem propria quando nao ha filtro de situacao.
    const filtrados = filtro.situacoes?.length ? itens.filter((item) => filtro.situacoes!.includes(item.situacao)) : itens;

    const [contagem] = await this.banco
      .select({ total: sql<number>`count(*)::int` })
      .from(parcelasReceber)
      .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
      .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .where(and(...condicoes));

    return { itens: filtrados, total: contagem?.total ?? 0, pagina: paginacao.pagina, tamanho: paginacao.tamanho };
  }

  async buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaReceberDetalhada | null> {
    const [linha] = await this.banco
      .select({
        ...this.colunasDaLista(),
        clienteId: titulosReceber.clienteId,
        categoriaId: titulosReceber.categoriaId,
        dataCompetencia: titulosReceber.dataCompetencia,
        observacoes: parcelasReceber.observacoes,
      })
      .from(parcelasReceber)
      .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
      .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosReceber.categoriaId))
      // O filtro por empresa vem junto do id: saber o UUID nao basta.
      .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
      .limit(1);

    if (!linha) return null;

    const historico = await this.banco
      .select({
        id: recebimentos.id,
        dataRecebimento: recebimentos.dataRecebimento,
        valorPrincipal: recebimentos.valorPrincipal,
        valorJuros: recebimentos.valorJuros,
        valorMulta: recebimentos.valorMulta,
        valorDesconto: recebimentos.valorDesconto,
        valorRecebido: recebimentos.valorRecebido,
        formaPagamento: recebimentos.formaPagamento,
        contaBancariaNome: contasBancarias.nome,
        situacao: recebimentos.situacao,
      })
      .from(recebimentos)
      .innerJoin(contasBancarias, eq(contasBancarias.id, recebimentos.contaBancariaId))
      .where(and(eq(recebimentos.parcelaReceberId, parcelaId), eq(recebimentos.empresaId, escopo.empresaId)))
      .orderBy(desc(recebimentos.dataRecebimento), desc(recebimentos.criadoEm));

    return {
      ...this.montarItem(linha, hoje),
      clienteId: linha.clienteId,
      categoriaId: linha.categoriaId,
      dataCompetencia: linha.dataCompetencia as DataCivil,
      observacoes: linha.observacoes,
      recebimentos: historico.map(
        (p): RecebimentoRegistrado => ({
          id: p.id,
          dataRecebimento: p.dataRecebimento as DataCivil,
          valorPrincipal: Dinheiro.deTexto(p.valorPrincipal),
          valorJuros: Dinheiro.deTexto(p.valorJuros),
          valorMulta: Dinheiro.deTexto(p.valorMulta),
          valorDesconto: Dinheiro.deTexto(p.valorDesconto),
          valorRecebido: Dinheiro.deTexto(p.valorRecebido),
          formaPagamento: p.formaPagamento,
          contaBancariaNome: p.contaBancariaNome,
          estornado: p.situacao === "estornado",
        }),
      ),
    };
  }

  /** Titulo + parcela nascem juntos, ou nenhum dos dois nasce. */
  async criar(escopo: EscopoEmpresa, dados: DadosNovaContaReceber, usuarioId: string): Promise<{ parcelaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const codigo = await this.proximoCodigo(transacao, escopo, dados.dataCompetencia);

      const [titulo] = await transacao
        .insert(titulosReceber)
        .values({
          empresaId: escopo.empresaId,
          codigo,
          clienteId: dados.clienteId,
          descricao: dados.descricao,
          dataCompetencia: dados.dataCompetencia,
          valorTotal: dados.valor.paraTexto(),
          quantidadeParcelas: 1,
          categoriaId: dados.categoriaId,
          situacao: "aberto",
          criadoPorUsuarioId: usuarioId,
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: titulosReceber.id });

      const [parcela] = await transacao
        .insert(parcelasReceber)
        .values({
          tituloReceberId: titulo!.id,
          empresaId: escopo.empresaId,
          numeroParcela: 1,
          dataVencimento: dados.dataVencimento,
          valorOriginal: dados.valor.paraTexto(),
          situacao: "aberta",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: parcelasReceber.id });

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.criada",
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

  async editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaReceber): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({ id: parcelasReceber.id, tituloId: parcelasReceber.tituloReceberId })
        .from(parcelasReceber)
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
        .limit(1);
      if (!parcela) return;

      await transacao
        .update(parcelasReceber)
        .set({ dataVencimento: dados.dataVencimento, valorOriginal: dados.valor.paraTexto(), observacoes: dados.observacoes ?? null, atualizadoEm: new Date() })
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)));

      await transacao
        .update(titulosReceber)
        .set({ descricao: dados.descricao, categoriaId: dados.categoriaId, valorTotal: dados.valor.paraTexto(), atualizadoEm: new Date() })
        .where(and(eq(titulosReceber.id, parcela.tituloId), eq(titulosReceber.empresaId, escopo.empresaId)));
    }, this.banco);
  }

  /**
   * Recebimento, movimentacao bancaria e novo saldo da parcela: uma transacao so.
   *
   * A parcela e travada com SELECT ... FOR UPDATE antes de qualquer conta. Sem
   * isso, dois cliques simultaneos no botao "Registrar recebimento" leriam o
   * mesmo saldo e gravariam duas baixas — a conta ficaria paga em dobro, com
   * duas entradas de dinheiro que nunca existiram.
   */
  async registrarRecebimento(escopo: EscopoEmpresa, parcelaId: string, dados: DadosRecebimento): Promise<{ recebimentoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({
          id: parcelasReceber.id,
          tituloId: parcelasReceber.tituloReceberId,
          valorOriginal: parcelasReceber.valorOriginal,
          valorRecebido: parcelasReceber.valorRecebido,
          situacao: parcelasReceber.situacao,
        })
        .from(parcelasReceber)
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

      const original = Dinheiro.deTexto(parcela.valorOriginal);
      const jaPago = Dinheiro.deTexto(parcela.valorRecebido);
      const saldo = saldoRestante({ valorOriginal: original, valorBaixado: jaPago });

      // Revalida DENTRO da transacao, com a linha travada: o saldo lido pela
      // tela pode estar velho.
      if (parcela.situacao !== "aberta") throw new Error("PARCELA_NAO_ESTA_ABERTA");
      if (!dados.valorPrincipal.ehPositivo()) throw new Error("VALOR_INVALIDO");
      if (dados.valorPrincipal.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

      const [titulo] = await transacao
        .select({ descricao: titulosReceber.descricao, codigo: titulosReceber.codigo, categoriaId: titulosReceber.categoriaId })
        .from(titulosReceber)
        .where(and(eq(titulosReceber.id, parcela.tituloId), eq(titulosReceber.empresaId, escopo.empresaId)))
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
          dataMovimentacao: dados.dataRecebimento,
          tipo: "entrada",
          valor: totalPago.paraTexto(),
          descricao: `${titulo?.codigo ?? "CR"} · ${titulo?.descricao ?? "Recebimento"}`,
          origem: "recebimento",
          ...(titulo?.categoriaId ? { categoriaId: titulo.categoriaId } : {}),
        })
        .returning({ id: movimentacoesBancarias.id });

      const [recebimento] = await transacao
        .insert(recebimentos)
        .values({
          parcelaReceberId: parcelaId,
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaId,
          movimentacaoBancariaId: movimentacao!.id,
          dataRecebimento: dados.dataRecebimento,
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          valorJuros: dados.valorJuros.paraTexto(),
          valorMulta: dados.valorMulta.paraTexto(),
          valorDesconto: dados.valorDesconto.paraTexto(),
          valorRecebido: totalPago.paraTexto(),
          formaPagamento: dados.formaPagamento as "pix",
          situacao: "registrado",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: recebimentos.id });

      const novoPago = jaPago.somar(dados.valorPrincipal);
      const quitada = !novoPago.menorQue(original);
      await transacao
        .update(parcelasReceber)
        .set({ valorRecebido: novoPago.paraTexto(), situacao: quitada ? "liquidada" : "aberta", atualizadoEm: new Date() })
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.paga",
        entidade: "parcela_pagar",
        entidadeId: parcelaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          valorRecebido: totalPago.paraTexto(),
          data: dados.dataRecebimento,
          quitada,
        },
      });

      return { recebimentoId: recebimento!.id };
    }, this.banco);
  }

  // ---- apoio ----

  private colunasDaLista() {
    return {
      parcelaId: parcelasReceber.id,
      tituloId: parcelasReceber.tituloReceberId,
      codigo: titulosReceber.codigo,
      descricao: titulosReceber.descricao,
      clienteNome: pessoas.nome,
      categoriaNome: categoriasFinanceiras.nome,
      dataVencimento: parcelasReceber.dataVencimento,
      valorOriginal: parcelasReceber.valorOriginal,
      valorRecebido: parcelasReceber.valorRecebido,
      situacaoParcela: parcelasReceber.situacao,
    };
  }

  private montarItem(linha: Record<string, unknown>, hoje: DataCivil): ContaReceberNaLista {
    const valorOriginal = Dinheiro.deTexto(String(linha.valorOriginal));
    const valorRecebido = Dinheiro.deTexto(String(linha.valorRecebido));
    const parcela = {
      valorOriginal,
      valorBaixado: valorRecebido,
      dataVencimento: String(linha.dataVencimento) as DataVencimento,
      situacaoGravada: String(linha.situacaoParcela) as "aberta" | "liquidada" | "cancelada" | "perdida",
    };
    return {
      parcelaId: String(linha.parcelaId),
      tituloId: String(linha.tituloId),
      codigo: String(linha.codigo),
      descricao: String(linha.descricao),
      clienteNome: String(linha.clienteNome),
      categoriaNome: String(linha.categoriaNome),
      dataVencimento: parcela.dataVencimento,
      valorOriginal,
      valorRecebido,
      saldo: saldoRestante(parcela),
      situacao: situacaoDerivada(parcela, hoje) as SituacaoDerivada,
    };
  }

  private condicoesDeBusca(escopo: EscopoEmpresa, filtro: FiltroContasReceber): SQL[] {
    const condicoes: SQL[] = [eq(parcelasReceber.empresaId, escopo.empresaId)];
    if (filtro.busca) {
      const alvo = `%${filtro.busca}%`;
      const busca = or(ilike(titulosReceber.descricao, alvo), ilike(titulosReceber.codigo, alvo), ilike(pessoas.nome, alvo));
      if (busca) condicoes.push(busca);
    }
    if (filtro.vencimentoDe) condicoes.push(gte(parcelasReceber.dataVencimento, filtro.vencimentoDe));
    if (filtro.vencimentoAte) condicoes.push(lte(parcelasReceber.dataVencimento, filtro.vencimentoAte));
    if (filtro.clienteId) condicoes.push(eq(titulosReceber.clienteId, filtro.clienteId));
    if (filtro.categoriaId) condicoes.push(eq(titulosReceber.categoriaId, filtro.categoriaId));
    return condicoes;
  }

  private async proximoCodigo(transacao: ExecutorBancoDados, escopo: EscopoEmpresa, competencia: DataCivil): Promise<string> {
    const ano = Number(competencia.slice(0, 4));
    const [linha] = await transacao.execute<{ proximo: number }>(sql`
      INSERT INTO sequencias_codigo (empresa_id, prefixo, ano, ultimo_numero)
      VALUES (${escopo.empresaId}, ${PREFIXOS_CODIGO.contaReceber}, ${ano}, 1)
      ON CONFLICT (empresa_id, prefixo, ano) DO UPDATE SET ultimo_numero = sequencias_codigo.ultimo_numero + 1
      RETURNING ultimo_numero AS proximo
    `);
    return formatarCodigo(PREFIXOS_CODIGO.contaReceber, ano, Number(linha?.proximo ?? 1));
  }
}

/** Data de hoje no fuso da empresa. A tela nunca decide "hoje" sozinha. */
export function hojeDaEmpresa(fusoHorario: string): DataCivil {
  return hojeDataCivil(fusoHorario);
}
