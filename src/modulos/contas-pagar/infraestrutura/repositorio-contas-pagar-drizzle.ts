import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { hojeDataCivil, type DataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import {
  abatimentoDaBaixa,
  camposEditaveis,
  saldoEmAberto,
  saldoRestante,
  situacaoDerivada,
  valorCancelado,
  valorQueMovimentaOBanco,
  type SituacaoDerivada,
} from "@/compartilhado/financeiro/indice";
import { deslocamento, type EscopoEmpresa, type PaginaResultado, type Paginacao } from "@/compartilhado/tipos/indice";
/*
 * As tabelas de OUTROS modulos vem do agregador de esquemas, nunca do
 * `infraestrutura/esquema.ts` alheio: um modulo so conhece o outro pelo
 * `publico.ts`, e esquema nao e interface publica. O agregador existe
 * exatamente para as juncoes que cruzam modulos.
 */
import {
  categoriasFinanceiras,
  conciliacoesMovimentacoes,
  contasBancarias,
  fornecedores,
  movimentacoesBancarias,
  pessoas,
} from "@/banco-dados/esquemas/indice";
import { filtroPorSituacaoDerivada, situacaoDerivadaSql } from "@/banco-dados/consultas/situacao-derivada-sql";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { formatarCodigo, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";

import type {
  ContaPagarDetalhada,
  ContaPagarNaLista,
  DadosCancelamento,
  DadosEdicaoContaPagar,
  DadosEstorno,
  DadosNovaContaPagar,
  DadosPagamento,
  FiltroContasPagar,
  PagamentoRegistrado,
  ParcelaIrma,
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
 * Uma conta pode ter UMA parcela (a vista) ou ate 120 (parcelada). As consultas
 * leem sempre por parcela: e a parcela que vence, que e paga e que aparece na
 * lista. O titulo guarda o que e comum (fornecedor, descricao, categoria).
 *
 * DINHEIRO NAO E APAGADO NEM SOBRESCRITO. Toda correcao cria registro novo:
 * o estorno marca a baixa e cria a movimentacao inversa; o cancelamento marca
 * a parcela e guarda o motivo. Nenhum `delete` nesta classe.
 */
export class RepositorioContasPagarDrizzle implements RepositorioContasPagar {
  constructor(private readonly banco: ExecutorBancoDados) {}

  /** As colunas que o CASE da situacao derivada le. Uma definicao para consulta e contagem. */
  private colunasDaSituacao() {
    return {
      situacao: parcelasPagar.situacao,
      valorOriginal: parcelasPagar.valorOriginal,
      valorBaixado: parcelasPagar.valorPago,
      dataVencimento: parcelasPagar.dataVencimento,
    };
  }

  async listar(
    escopo: EscopoEmpresa,
    filtro: FiltroContasPagar,
    paginacao: Paginacao,
    hoje: DataCivil,
  ): Promise<PaginaResultado<ContaPagarNaLista>> {
    const condicoes = this.condicoesDeBusca(escopo, filtro, hoje);

    const linhas = await this.banco
      .select(this.colunasDaLista())
      .from(parcelasPagar)
      .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
      .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosPagar.categoriaId))
      .where(and(...condicoes))
      .orderBy(parcelasPagar.dataVencimento, titulosPagar.codigo, parcelasPagar.numeroParcela)
      .limit(paginacao.tamanho)
      .offset(deslocamento(paginacao));

    /*
     * A contagem usa EXATAMENTE as mesmas condicoes da consulta, inclusive o
     * filtro por situacao derivada. Contar sem o filtro (ou filtrar depois de
     * ler a pagina) diria "50 contas" numa lista de 20 — e, com paginacao
     * real, contas sumiriam entre as paginas sem ninguem perceber.
     */
    const [contagem] = await this.banco
      .select({ total: sql<number>`count(*)::int` })
      .from(parcelasPagar)
      .innerJoin(titulosPagar, eq(titulosPagar.id, parcelasPagar.tituloPagarId))
      .innerJoin(fornecedores, eq(fornecedores.id, titulosPagar.fornecedorId))
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .where(and(...condicoes));

    return {
      itens: linhas.map((linha) => this.montarItem(linha, hoje)),
      total: contagem?.total ?? 0,
      pagina: paginacao.pagina,
      tamanho: paginacao.tamanho,
    };
  }

  async buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaPagarDetalhada | null> {
    const [linha] = await this.banco
      .select({
        ...this.colunasDaLista(),
        fornecedorId: titulosPagar.fornecedorId,
        categoriaId: titulosPagar.categoriaId,
        dataCompetencia: titulosPagar.dataCompetencia,
        observacoes: parcelasPagar.observacoes,
        tituloSituacao: titulosPagar.situacao,
        motivoCancelamento: titulosPagar.motivoCancelamento,
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

    const [historico, irmas, baixasAtivas] = await Promise.all([
      this.historicoDaParcela(escopo, parcelaId),
      this.parcelasDoTitulo(escopo, linha.tituloId, hoje),
      this.contarBaixasAtivas(escopo, linha.tituloId),
    ]);

    return {
      ...this.montarItem(linha, hoje),
      fornecedorId: linha.fornecedorId,
      categoriaId: linha.categoriaId,
      dataCompetencia: linha.dataCompetencia as DataCivil,
      observacoes: linha.observacoes,
      tituloCancelado: linha.tituloSituacao === "cancelado",
      motivoCancelamento: linha.motivoCancelamento,
      tituloTemBaixaAtiva: baixasAtivas.noTitulo > 0,
      parcelaTemBaixaAtiva: historico.some((p) => !p.estornado),
      pagamentos: historico,
      parcelas: irmas,
    };
  }

  /** Titulo e TODAS as parcelas nascem juntos, ou nenhum deles nasce. */
  async criar(escopo: EscopoEmpresa, dados: DadosNovaContaPagar, usuarioId: string): Promise<{ tituloId: string; parcelaId: string }> {
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
          valorTotal: dados.valorTotal.paraTexto(),
          quantidadeParcelas: dados.parcelas.length,
          categoriaId: dados.categoriaId,
          situacao: "aberto",
          criadoPorUsuarioId: usuarioId,
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: titulosPagar.id });

      const criadas = await transacao
        .insert(parcelasPagar)
        .values(
          dados.parcelas.map((parcela) => ({
            tituloPagarId: titulo!.id,
            empresaId: escopo.empresaId,
            numeroParcela: parcela.numero,
            dataVencimento: parcela.dataVencimento,
            valorOriginal: parcela.valor.paraTexto(),
            situacao: "aberta" as const,
            ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
          })),
        )
        .returning({ id: parcelasPagar.id, numero: parcelasPagar.numeroParcela });

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.criada",
        entidade: "titulo_pagar",
        entidadeId: titulo!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: {
          codigo,
          descricao: dados.descricao,
          valorTotal: dados.valorTotal.paraTexto(),
          parcelas: dados.parcelas.length,
          primeiroVencimento: dados.parcelas[0]?.dataVencimento ?? null,
        },
      });

      const primeira = criadas.find((p) => p.numero === 1) ?? criadas[0];
      return { tituloId: titulo!.id, parcelaId: primeira!.id };
    }, this.banco);
  }

  /**
   * Edicao com as travas revalidadas AQUI, no servidor.
   *
   * A tela ja mostra os campos bloqueados como somente leitura, mas um campo
   * desabilitado no HTML nao e controle nenhum: basta um POST direto. As
   * mesmas regras de `camposEditaveis` sao aplicadas de novo contra o estado
   * lido do banco, com a linha travada.
   */
  async editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaPagar, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({
          id: parcelasPagar.id,
          tituloId: parcelasPagar.tituloPagarId,
          situacao: parcelasPagar.situacao,
          valorOriginal: parcelasPagar.valorOriginal,
          dataVencimento: parcelasPagar.dataVencimento,
        })
        .from(parcelasPagar)
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

      const [titulo] = await transacao
        .select({
          id: titulosPagar.id,
          situacao: titulosPagar.situacao,
          fornecedorId: titulosPagar.fornecedorId,
          descricao: titulosPagar.descricao,
          categoriaId: titulosPagar.categoriaId,
          valorTotal: titulosPagar.valorTotal,
          quantidadeParcelas: titulosPagar.quantidadeParcelas,
        })
        .from(titulosPagar)
        .where(and(eq(titulosPagar.id, parcela.tituloId), eq(titulosPagar.empresaId, escopo.empresaId)))
        .limit(1);
      if (!titulo) throw new Error("PARCELA_NAO_ENCONTRADA");

      const baixas = await this.contarBaixasAtivas(escopo, titulo.id, transacao, parcelaId);
      const editaveis = camposEditaveis(
        { cancelado: titulo.situacao === "cancelado", temBaixaAtiva: baixas.noTitulo > 0 },
        { cancelada: parcela.situacao === "cancelada", temBaixaAtiva: baixas.naParcela > 0 },
      );

      if (!editaveis.descricao) throw new Error("EDICAO_BLOQUEADA");
      if (!editaveis.pessoa && dados.fornecedorId !== titulo.fornecedorId) throw new Error("FORNECEDOR_BLOQUEADO");
      if (!editaveis.vencimento && dados.dataVencimento !== parcela.dataVencimento) throw new Error("VENCIMENTO_BLOQUEADO");
      if (!editaveis.valor && dados.valor.paraTexto() !== Dinheiro.deTexto(parcela.valorOriginal).paraTexto()) {
        throw new Error("VALOR_BLOQUEADO");
      }

      const novoValor = editaveis.valor ? dados.valor : Dinheiro.deTexto(parcela.valorOriginal);

      await transacao
        .update(parcelasPagar)
        .set({
          ...(editaveis.vencimento ? { dataVencimento: dados.dataVencimento } : {}),
          valorOriginal: novoValor.paraTexto(),
          observacoes: dados.observacoes ?? null,
          atualizadoEm: new Date(),
        })
        .where(and(eq(parcelasPagar.id, parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)));

      /*
       * `valor_total` do titulo e a soma das parcelas (desnormalizacao
       * documentada no modelo). Se o valor mudou, ele e recalculado a partir
       * das parcelas, nunca "ajustado" por diferenca: recalcular nao acumula
       * erro quando algo ja saiu do lugar.
       */
      const [soma] = await transacao
        .select({ total: sql<string>`COALESCE(SUM(${parcelasPagar.valorOriginal}), 0)::text` })
        .from(parcelasPagar)
        .where(and(eq(parcelasPagar.tituloPagarId, titulo.id), eq(parcelasPagar.empresaId, escopo.empresaId)));

      await transacao
        .update(titulosPagar)
        .set({
          descricao: dados.descricao,
          categoriaId: dados.categoriaId,
          ...(editaveis.pessoa ? { fornecedorId: dados.fornecedorId } : {}),
          valorTotal: Dinheiro.deTexto(soma?.total ?? "0").paraTexto(),
          atualizadoEm: new Date(),
        })
        .where(and(eq(titulosPagar.id, titulo.id), eq(titulosPagar.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.editada",
        entidade: "parcela_pagar",
        entidadeId: parcelaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosAntes: {
          descricao: titulo.descricao,
          categoriaId: titulo.categoriaId,
          fornecedorId: titulo.fornecedorId,
          dataVencimento: parcela.dataVencimento,
          valor: parcela.valorOriginal,
        },
        dadosDepois: {
          descricao: dados.descricao,
          categoriaId: dados.categoriaId,
          fornecedorId: editaveis.pessoa ? dados.fornecedorId : titulo.fornecedorId,
          dataVencimento: editaveis.vencimento ? dados.dataVencimento : parcela.dataVencimento,
          valor: novoValor.paraTexto(),
        },
      });
    }, this.banco);
  }

  /**
   * Pagamento, movimentacao bancaria e novo saldo da parcela: uma transacao so.
   *
   * A parcela e travada com SELECT ... FOR UPDATE antes de qualquer conta. Sem
   * isso, dois cliques simultaneos no botao "Registrar pagamento" leriam o
   * mesmo saldo e gravariam duas baixas — a conta ficaria paga em dobro, com
   * duas saidas reais de dinheiro.
   *
   * Sobre os tres valores (principal, abatimento, saida no banco), ver o
   * cabecalho de `compartilhado/financeiro/validacao-de-baixa.ts`. Aqui a
   * traducao para o modelo: a coluna `valor_principal` guarda o ABATIMENTO, e
   * o CHECK do banco (`valor_pago = principal + juros + multa - desconto`)
   * fecha a conta sozinho.
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
      if (dados.valorDesconto.ehNegativo() || dados.valorJuros.ehNegativo() || dados.valorMulta.ehNegativo()) {
        throw new Error("VALOR_INVALIDO");
      }

      const abatimento = abatimentoDaBaixa(dados.valorPrincipal, dados.valorDesconto);
      if (abatimento.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

      const saiDoBanco = valorQueMovimentaOBanco(dados.valorPrincipal, dados.valorJuros, dados.valorMulta);
      if (!saiDoBanco.ehPositivo()) throw new Error("VALOR_INVALIDO");

      const [titulo] = await transacao
        .select({ descricao: titulosPagar.descricao, codigo: titulosPagar.codigo, categoriaId: titulosPagar.categoriaId })
        .from(titulosPagar)
        .where(and(eq(titulosPagar.id, parcela.tituloId), eq(titulosPagar.empresaId, escopo.empresaId)))
        .limit(1);

      // A conta bancaria precisa ser DESTA empresa: sem esta checagem, pagar
      // com a conta de outra empresa seria possivel informando o UUID.
      await this.exigirContaDaEmpresa(transacao, escopo, dados.contaBancariaId);

      const [movimentacao] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaId,
          dataMovimentacao: dados.dataPagamento,
          tipo: "saida",
          valor: saiDoBanco.paraTexto(),
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
          valorPrincipal: abatimento.paraTexto(),
          valorJuros: dados.valorJuros.paraTexto(),
          valorMulta: dados.valorMulta.paraTexto(),
          valorDesconto: dados.valorDesconto.paraTexto(),
          valorPago: saiDoBanco.paraTexto(),
          formaPagamento: dados.formaPagamento as "pix",
          situacao: "registrado",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: pagamentos.id });

      const novoPago = jaPago.somar(abatimento);
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
          valorDesconto: dados.valorDesconto.paraTexto(),
          abatido: abatimento.paraTexto(),
          saiuDoBanco: saiDoBanco.paraTexto(),
          data: dados.dataPagamento,
          quitada,
        },
      });

      return { pagamentoId: pagamento!.id };
    }, this.banco);
  }

  /**
   * Estorno: a baixa errada continua no historico, marcada, com uma
   * movimentacao inversa ao lado.
   *
   * Nao existe "desfazer" que apaga. Quem conferir o extrato do mes vai ver a
   * saida e a entrada — e e isso que bate com o extrato do banco de verdade,
   * onde o dinheiro tambem saiu e voltou.
   */
  async estornarPagamento(escopo: EscopoEmpresa, pagamentoId: string, dados: DadosEstorno): Promise<{ parcelaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [pagamento] = await transacao
        .select({
          id: pagamentos.id,
          parcelaId: pagamentos.parcelaPagarId,
          contaBancariaId: pagamentos.contaBancariaId,
          movimentacaoId: pagamentos.movimentacaoBancariaId,
          valorPrincipal: pagamentos.valorPrincipal,
          valorPago: pagamentos.valorPago,
          situacao: pagamentos.situacao,
        })
        .from(pagamentos)
        .where(and(eq(pagamentos.id, pagamentoId), eq(pagamentos.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!pagamento) throw new Error("PAGAMENTO_NAO_ENCONTRADO");
      if (pagamento.situacao === "estornado") throw new Error("PAGAMENTO_JA_ESTORNADO");

      /*
       * Ponto de encontro com o Gate 6: uma baixa cuja movimentacao ja foi
       * conciliada com o extrato nao pode ser estornada por aqui. Desfazer a
       * conciliacao e uma decisao consciente, com o seu proprio registro —
       * estornar por baixo dela deixaria a conciliacao apontando para um
       * lancamento que nao existe mais como era.
       */
      const [conciliada] = await transacao
        .select({ id: conciliacoesMovimentacoes.id })
        .from(conciliacoesMovimentacoes)
        .where(and(eq(conciliacoesMovimentacoes.movimentacaoId, pagamento.movimentacaoId), eq(conciliacoesMovimentacoes.ativo, true)))
        .limit(1);
      if (conciliada) throw new Error("BAIXA_CONCILIADA");

      const [parcela] = await transacao
        .select({
          id: parcelasPagar.id,
          tituloId: parcelasPagar.tituloPagarId,
          valorOriginal: parcelasPagar.valorOriginal,
          valorPago: parcelasPagar.valorPago,
          situacao: parcelasPagar.situacao,
        })
        .from(parcelasPagar)
        .where(and(eq(parcelasPagar.id, pagamento.parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");
      if (parcela.situacao === "cancelada") throw new Error("PARCELA_CANCELADA");

      const [original] = await transacao
        .select({ descricao: movimentacoesBancarias.descricao, categoriaId: movimentacoesBancarias.categoriaId })
        .from(movimentacoesBancarias)
        .where(and(eq(movimentacoesBancarias.id, pagamento.movimentacaoId), eq(movimentacoesBancarias.empresaId, escopo.empresaId)))
        .limit(1);

      // Movimentacao inversa: o pagamento saiu, o estorno entra. Mesmo valor,
      // mesma conta, apontando para a movimentacao que desfaz.
      const [inversa] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: pagamento.contaBancariaId,
          dataMovimentacao: dados.dataEstorno,
          tipo: "entrada",
          valor: pagamento.valorPago,
          descricao: `Estorno · ${original?.descricao ?? "pagamento"}`,
          origem: "estorno",
          movimentacaoEstornadaId: pagamento.movimentacaoId,
          ...(original?.categoriaId ? { categoriaId: original.categoriaId } : {}),
          observacoes: dados.motivo,
        })
        .returning({ id: movimentacoesBancarias.id });

      await transacao
        .update(pagamentos)
        .set({
          situacao: "estornado",
          estornadoEm: new Date(),
          motivoEstorno: dados.motivo,
          movimentacaoEstornoId: inversa!.id,
        })
        .where(and(eq(pagamentos.id, pagamentoId), eq(pagamentos.empresaId, escopo.empresaId)));

      // O que volta ao saldo e o ABATIMENTO (coluna `valor_principal`), nao o
      // que saiu do banco: juros e multa nunca abateram nada.
      const devolvido = Dinheiro.deTexto(pagamento.valorPrincipal);
      const novoPago = Dinheiro.deTexto(parcela.valorPago).subtrair(devolvido);
      const restaurado = novoPago.ehNegativo() ? Dinheiro.zero() : novoPago;

      await transacao
        .update(parcelasPagar)
        .set({ valorPago: restaurado.paraTexto(), situacao: "aberta", atualizadoEm: new Date() })
        .where(and(eq(parcelasPagar.id, parcela.id), eq(parcelasPagar.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.pagamento_estornado",
        entidade: "pagamento",
        entidadeId: pagamentoId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosAntes: { valorPago: parcela.valorPago, situacao: parcela.situacao },
        dadosDepois: {
          valorPago: restaurado.paraTexto(),
          situacao: "aberta",
          motivo: dados.motivo,
          movimentacaoEstorno: inversa!.id,
        },
      });

      return { parcelaId: parcela.id };
    }, this.banco);
  }

  /**
   * Cancelamento: o que ainda nao foi pago deixa de ser cobrado.
   *
   * As baixas ja registradas continuam valendo — o dinheiro saiu de verdade e
   * apagar isso seria falsificar o extrato. Parcelas ja liquidadas ficam como
   * estao; so as em aberto viram `cancelada`. O motivo fica gravado no titulo.
   */
  async cancelar(escopo: EscopoEmpresa, tituloId: string, dados: DadosCancelamento): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [titulo] = await transacao
        .select({ id: titulosPagar.id, situacao: titulosPagar.situacao, codigo: titulosPagar.codigo })
        .from(titulosPagar)
        .where(and(eq(titulosPagar.id, tituloId), eq(titulosPagar.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!titulo) throw new Error("CONTA_NAO_ENCONTRADA");
      if (titulo.situacao === "cancelado") throw new Error("CONTA_JA_CANCELADA");

      const abertas = await transacao
        .select({ id: parcelasPagar.id })
        .from(parcelasPagar)
        .where(
          and(
            eq(parcelasPagar.tituloPagarId, tituloId),
            eq(parcelasPagar.empresaId, escopo.empresaId),
            eq(parcelasPagar.situacao, "aberta"),
          ),
        )
        .for("update");

      if (abertas.length > 0) {
        await transacao
          .update(parcelasPagar)
          .set({ situacao: "cancelada", atualizadoEm: new Date() })
          .where(
            and(
              inArray(
                parcelasPagar.id,
                abertas.map((p) => p.id),
              ),
              eq(parcelasPagar.empresaId, escopo.empresaId),
            ),
          );
      }

      await transacao
        .update(titulosPagar)
        .set({ situacao: "cancelado", canceladoEm: new Date(), motivoCancelamento: dados.motivo, atualizadoEm: new Date() })
        .where(and(eq(titulosPagar.id, tituloId), eq(titulosPagar.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_pagar.cancelada",
        entidade: "titulo_pagar",
        entidadeId: tituloId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosAntes: { situacao: titulo.situacao },
        dadosDepois: { situacao: "cancelado", motivo: dados.motivo, parcelasCanceladas: abertas.length },
      });
    }, this.banco);
  }

  // ---- apoio ----

  private async exigirContaDaEmpresa(transacao: ExecutorBancoDados, escopo: EscopoEmpresa, contaBancariaId: string): Promise<void> {
    const [conta] = await transacao
      .select({ id: contasBancarias.id })
      .from(contasBancarias)
      .where(and(eq(contasBancarias.id, contaBancariaId), eq(contasBancarias.empresaId, escopo.empresaId)))
      .limit(1);
    if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");
  }

  /** Quantas baixas NAO estornadas existem no titulo (e, opcionalmente, numa parcela). */
  private async contarBaixasAtivas(
    escopo: EscopoEmpresa,
    tituloId: string,
    executor: ExecutorBancoDados = this.banco,
    parcelaId?: string,
  ): Promise<{ noTitulo: number; naParcela: number }> {
    const linhas = await executor
      .select({ parcelaId: pagamentos.parcelaPagarId, total: sql<number>`count(*)::int` })
      .from(pagamentos)
      .innerJoin(parcelasPagar, eq(parcelasPagar.id, pagamentos.parcelaPagarId))
      .where(
        and(
          eq(parcelasPagar.tituloPagarId, tituloId),
          eq(pagamentos.empresaId, escopo.empresaId),
          eq(pagamentos.situacao, "registrado"),
        ),
      )
      .groupBy(pagamentos.parcelaPagarId);

    const noTitulo = linhas.reduce((soma, linha) => soma + linha.total, 0);
    const naParcela = parcelaId ? (linhas.find((l) => l.parcelaId === parcelaId)?.total ?? 0) : 0;
    return { noTitulo, naParcela };
  }

  private async historicoDaParcela(escopo: EscopoEmpresa, parcelaId: string): Promise<readonly PagamentoRegistrado[]> {
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
        estornadoEm: pagamentos.estornadoEm,
        motivoEstorno: pagamentos.motivoEstorno,
        conciliacaoId: conciliacoesMovimentacoes.id,
      })
      .from(pagamentos)
      .innerJoin(contasBancarias, eq(contasBancarias.id, pagamentos.contaBancariaId))
      .leftJoin(
        conciliacoesMovimentacoes,
        and(eq(conciliacoesMovimentacoes.movimentacaoId, pagamentos.movimentacaoBancariaId), eq(conciliacoesMovimentacoes.ativo, true)),
      )
      .where(and(eq(pagamentos.parcelaPagarId, parcelaId), eq(pagamentos.empresaId, escopo.empresaId)))
      .orderBy(desc(pagamentos.dataPagamento), desc(pagamentos.criadoEm));

    return historico.map((p): PagamentoRegistrado => {
      const abatido = Dinheiro.deTexto(p.valorPrincipal);
      const desconto = Dinheiro.deTexto(p.valorDesconto);
      const estornado = p.situacao === "estornado";
      return {
        id: p.id,
        dataPagamento: p.dataPagamento as DataCivil,
        // A coluna guarda o abatimento; a tela fala de dinheiro.
        valorPrincipal: abatido.subtrair(desconto),
        valorJuros: Dinheiro.deTexto(p.valorJuros),
        valorMulta: Dinheiro.deTexto(p.valorMulta),
        valorDesconto: desconto,
        valorAbatido: abatido,
        valorPago: Dinheiro.deTexto(p.valorPago),
        formaPagamento: p.formaPagamento,
        contaBancariaNome: p.contaBancariaNome,
        estornado,
        estornadoEm: p.estornadoEm,
        motivoEstorno: p.motivoEstorno,
        podeEstornar: !estornado && p.conciliacaoId === null,
      };
    });
  }

  private async parcelasDoTitulo(escopo: EscopoEmpresa, tituloId: string, hoje: DataCivil): Promise<readonly ParcelaIrma[]> {
    const linhas = await this.banco
      .select({
        parcelaId: parcelasPagar.id,
        numeroParcela: parcelasPagar.numeroParcela,
        dataVencimento: parcelasPagar.dataVencimento,
        valorOriginal: parcelasPagar.valorOriginal,
        valorPago: parcelasPagar.valorPago,
        situacaoParcela: parcelasPagar.situacao,
      })
      .from(parcelasPagar)
      .where(and(eq(parcelasPagar.tituloPagarId, tituloId), eq(parcelasPagar.empresaId, escopo.empresaId)))
      .orderBy(asc(parcelasPagar.numeroParcela));

    return linhas.map((linha) => {
      const calculo = this.paraCalculo(linha);
      return {
        parcelaId: linha.parcelaId,
        numeroParcela: linha.numeroParcela,
        dataVencimento: linha.dataVencimento as DataVencimento,
        valorOriginal: calculo.valorOriginal,
        valorPago: calculo.valorBaixado,
        saldo: saldoEmAberto(calculo),
        situacao: situacaoDerivada(calculo, hoje),
      };
    });
  }

  private colunasDaLista() {
    return {
      parcelaId: parcelasPagar.id,
      tituloId: parcelasPagar.tituloPagarId,
      codigo: titulosPagar.codigo,
      descricao: titulosPagar.descricao,
      fornecedorNome: pessoas.nome,
      categoriaNome: categoriasFinanceiras.nome,
      numeroParcela: parcelasPagar.numeroParcela,
      quantidadeParcelas: titulosPagar.quantidadeParcelas,
      dataVencimento: parcelasPagar.dataVencimento,
      valorOriginal: parcelasPagar.valorOriginal,
      valorPago: parcelasPagar.valorPago,
      situacaoParcela: parcelasPagar.situacao,
    };
  }

  private paraCalculo(linha: Record<string, unknown>) {
    return {
      valorOriginal: Dinheiro.deTexto(String(linha.valorOriginal)),
      valorBaixado: Dinheiro.deTexto(String(linha.valorPago)),
      dataVencimento: String(linha.dataVencimento) as DataVencimento,
      situacaoGravada: String(linha.situacaoParcela) as "aberta" | "liquidada" | "cancelada" | "perdida",
    };
  }

  private montarItem(linha: Record<string, unknown>, hoje: DataCivil): ContaPagarNaLista {
    const calculo = this.paraCalculo(linha);
    return {
      parcelaId: String(linha.parcelaId),
      tituloId: String(linha.tituloId),
      codigo: String(linha.codigo),
      descricao: String(linha.descricao),
      fornecedorNome: String(linha.fornecedorNome),
      categoriaNome: String(linha.categoriaNome),
      numeroParcela: Number(linha.numeroParcela),
      quantidadeParcelas: Number(linha.quantidadeParcelas),
      dataVencimento: calculo.dataVencimento,
      valorOriginal: calculo.valorOriginal,
      valorPago: calculo.valorBaixado,
      saldo: saldoEmAberto(calculo),
      valorCancelado: valorCancelado(calculo),
      situacao: situacaoDerivada(calculo, hoje) as SituacaoDerivada,
    };
  }

  private condicoesDeBusca(escopo: EscopoEmpresa, filtro: FiltroContasPagar, hoje: DataCivil): SQL[] {
    const condicoes: SQL[] = [eq(parcelasPagar.empresaId, escopo.empresaId)];
    if (filtro.busca) {
      const alvo = `%${filtro.busca}%`;
      const busca = or(ilike(titulosPagar.descricao, alvo), ilike(titulosPagar.codigo, alvo), ilike(pessoas.nome, alvo));
      if (busca) condicoes.push(busca);
    }
    if (filtro.situacoes?.length) {
      condicoes.push(filtroPorSituacaoDerivada(this.colunasDaSituacao(), hoje, filtro.situacoes));
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

/** A expressao SQL usada no filtro por situacao. Exportada para o teste de acordo com a versao TS. */
export function situacaoDerivadaDaParcelaPagar(hoje: DataCivil) {
  return situacaoDerivadaSql(
    {
      situacao: parcelasPagar.situacao,
      valorOriginal: parcelasPagar.valorOriginal,
      valorBaixado: parcelasPagar.valorPago,
      dataVencimento: parcelasPagar.dataVencimento,
    },
    hoje,
  );
}
