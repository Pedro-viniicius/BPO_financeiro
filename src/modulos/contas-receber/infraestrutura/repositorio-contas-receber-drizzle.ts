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
  clientes,
  conciliacoesMovimentacoes,
  contasBancarias,
  movimentacoesBancarias,
  pessoas,
} from "@/banco-dados/esquemas/indice";
import { filtroPorSituacaoDerivada, situacaoDerivadaSql } from "@/banco-dados/consultas/situacao-derivada-sql";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { formatarCodigo, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";

import type {
  ContaReceberDetalhada,
  ContaReceberNaLista,
  DadosCancelamento,
  DadosEdicaoContaReceber,
  DadosEstorno,
  DadosNovaContaReceber,
  DadosRecebimento,
  FiltroContasReceber,
  ParcelaIrma,
  RecebimentoRegistrado,
  RepositorioContasReceber,
} from "../aplicacao/repositorio-contas-receber";
import { parcelasReceber, recebimentos, titulosReceber } from "./esquema";

/**
 * Contas a receber no PostgreSQL.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`, sempre. Como a
 * ADR-017 decidiu nao usar seguranca por linha, este filtro e a unica barreira
 * entre empresas — por isso ele aparece em TODA clausula `where`, inclusive
 * nas buscas por id. Provado em `repositorio-contas-receber.isolamento.teste.ts`.
 *
 * Uma conta pode ter UMA parcela (a vista) ou ate 120 (parcelada). As consultas
 * leem sempre por parcela: e a parcela que vence, que e paga e que aparece na
 * lista. O titulo guarda o que e comum (cliente, descricao, categoria).
 *
 * DINHEIRO NAO E APAGADO NEM SOBRESCRITO. Toda correcao cria registro novo:
 * o estorno marca a baixa e cria a movimentacao inversa; o cancelamento marca
 * a parcela e guarda o motivo. Nenhum `delete` nesta classe.
 */
export class RepositorioContasReceberDrizzle implements RepositorioContasReceber {
  constructor(private readonly banco: ExecutorBancoDados) {}

  /** As colunas que o CASE da situacao derivada le. Uma definicao para consulta e contagem. */
  private colunasDaSituacao() {
    return {
      situacao: parcelasReceber.situacao,
      valorOriginal: parcelasReceber.valorOriginal,
      valorBaixado: parcelasReceber.valorRecebido,
      dataVencimento: parcelasReceber.dataVencimento,
    };
  }

  async listar(
    escopo: EscopoEmpresa,
    filtro: FiltroContasReceber,
    paginacao: Paginacao,
    hoje: DataCivil,
  ): Promise<PaginaResultado<ContaReceberNaLista>> {
    const condicoes = this.condicoesDeBusca(escopo, filtro, hoje);

    const linhas = await this.banco
      .select(this.colunasDaLista())
      .from(parcelasReceber)
      .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
      .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, titulosReceber.categoriaId))
      .where(and(...condicoes))
      .orderBy(parcelasReceber.dataVencimento, titulosReceber.codigo, parcelasReceber.numeroParcela)
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
      .from(parcelasReceber)
      .innerJoin(titulosReceber, eq(titulosReceber.id, parcelasReceber.tituloReceberId))
      .innerJoin(clientes, eq(clientes.id, titulosReceber.clienteId))
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .where(and(...condicoes));

    return {
      itens: linhas.map((linha) => this.montarItem(linha, hoje)),
      total: contagem?.total ?? 0,
      pagina: paginacao.pagina,
      tamanho: paginacao.tamanho,
    };
  }

  async buscarPorId(escopo: EscopoEmpresa, parcelaId: string, hoje: DataCivil): Promise<ContaReceberDetalhada | null> {
    const [linha] = await this.banco
      .select({
        ...this.colunasDaLista(),
        clienteId: titulosReceber.clienteId,
        categoriaId: titulosReceber.categoriaId,
        dataCompetencia: titulosReceber.dataCompetencia,
        observacoes: parcelasReceber.observacoes,
        tituloSituacao: titulosReceber.situacao,
        motivoCancelamento: titulosReceber.motivoCancelamento,
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

    const [historico, irmas, baixasAtivas] = await Promise.all([
      this.historicoDaParcela(escopo, parcelaId),
      this.parcelasDoTitulo(escopo, linha.tituloId, hoje),
      this.contarBaixasAtivas(escopo, linha.tituloId),
    ]);

    return {
      ...this.montarItem(linha, hoje),
      clienteId: linha.clienteId,
      categoriaId: linha.categoriaId,
      dataCompetencia: linha.dataCompetencia as DataCivil,
      observacoes: linha.observacoes,
      tituloCancelado: linha.tituloSituacao === "cancelado",
      motivoCancelamento: linha.motivoCancelamento,
      tituloTemBaixaAtiva: baixasAtivas.noTitulo > 0,
      parcelaTemBaixaAtiva: historico.some((p) => !p.estornado),
      recebimentos: historico,
      parcelas: irmas,
    };
  }

  /** Titulo e TODAS as parcelas nascem juntos, ou nenhum deles nasce. */
  async criar(escopo: EscopoEmpresa, dados: DadosNovaContaReceber, usuarioId: string): Promise<{ tituloId: string; parcelaId: string }> {
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
          valorTotal: dados.valorTotal.paraTexto(),
          quantidadeParcelas: dados.parcelas.length,
          categoriaId: dados.categoriaId,
          situacao: "aberto",
          criadoPorUsuarioId: usuarioId,
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: titulosReceber.id });

      const criadas = await transacao
        .insert(parcelasReceber)
        .values(
          dados.parcelas.map((parcela) => ({
            tituloReceberId: titulo!.id,
            empresaId: escopo.empresaId,
            numeroParcela: parcela.numero,
            dataVencimento: parcela.dataVencimento,
            valorOriginal: parcela.valor.paraTexto(),
            situacao: "aberta" as const,
            ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
          })),
        )
        .returning({ id: parcelasReceber.id, numero: parcelasReceber.numeroParcela });

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.criada",
        entidade: "titulo_receber",
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
  async editar(escopo: EscopoEmpresa, parcelaId: string, dados: DadosEdicaoContaReceber, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [parcela] = await transacao
        .select({
          id: parcelasReceber.id,
          tituloId: parcelasReceber.tituloReceberId,
          situacao: parcelasReceber.situacao,
          valorOriginal: parcelasReceber.valorOriginal,
          dataVencimento: parcelasReceber.dataVencimento,
        })
        .from(parcelasReceber)
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

      const [titulo] = await transacao
        .select({
          id: titulosReceber.id,
          situacao: titulosReceber.situacao,
          clienteId: titulosReceber.clienteId,
          descricao: titulosReceber.descricao,
          categoriaId: titulosReceber.categoriaId,
          valorTotal: titulosReceber.valorTotal,
          quantidadeParcelas: titulosReceber.quantidadeParcelas,
        })
        .from(titulosReceber)
        .where(and(eq(titulosReceber.id, parcela.tituloId), eq(titulosReceber.empresaId, escopo.empresaId)))
        .limit(1);
      if (!titulo) throw new Error("PARCELA_NAO_ENCONTRADA");

      const baixas = await this.contarBaixasAtivas(escopo, titulo.id, transacao, parcelaId);
      const editaveis = camposEditaveis(
        { cancelado: titulo.situacao === "cancelado", temBaixaAtiva: baixas.noTitulo > 0 },
        { cancelada: parcela.situacao === "cancelada", temBaixaAtiva: baixas.naParcela > 0 },
      );

      if (!editaveis.descricao) throw new Error("EDICAO_BLOQUEADA");
      if (!editaveis.pessoa && dados.clienteId !== titulo.clienteId) throw new Error("CLIENTE_BLOQUEADO");
      if (!editaveis.vencimento && dados.dataVencimento !== parcela.dataVencimento) throw new Error("VENCIMENTO_BLOQUEADO");
      if (!editaveis.valor && dados.valor.paraTexto() !== Dinheiro.deTexto(parcela.valorOriginal).paraTexto()) {
        throw new Error("VALOR_BLOQUEADO");
      }

      const novoValor = editaveis.valor ? dados.valor : Dinheiro.deTexto(parcela.valorOriginal);

      await transacao
        .update(parcelasReceber)
        .set({
          ...(editaveis.vencimento ? { dataVencimento: dados.dataVencimento } : {}),
          valorOriginal: novoValor.paraTexto(),
          observacoes: dados.observacoes ?? null,
          atualizadoEm: new Date(),
        })
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)));

      /*
       * `valor_total` do titulo e a soma das parcelas (desnormalizacao
       * documentada no modelo). Se o valor mudou, ele e recalculado a partir
       * das parcelas, nunca "ajustado" por diferenca: recalcular nao acumula
       * erro quando algo ja saiu do lugar.
       */
      const [soma] = await transacao
        .select({ total: sql<string>`COALESCE(SUM(${parcelasReceber.valorOriginal}), 0)::text` })
        .from(parcelasReceber)
        .where(and(eq(parcelasReceber.tituloReceberId, titulo.id), eq(parcelasReceber.empresaId, escopo.empresaId)));

      await transacao
        .update(titulosReceber)
        .set({
          descricao: dados.descricao,
          categoriaId: dados.categoriaId,
          ...(editaveis.pessoa ? { clienteId: dados.clienteId } : {}),
          valorTotal: Dinheiro.deTexto(soma?.total ?? "0").paraTexto(),
          atualizadoEm: new Date(),
        })
        .where(and(eq(titulosReceber.id, titulo.id), eq(titulosReceber.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.editada",
        entidade: "parcela_receber",
        entidadeId: parcelaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosAntes: {
          descricao: titulo.descricao,
          categoriaId: titulo.categoriaId,
          clienteId: titulo.clienteId,
          dataVencimento: parcela.dataVencimento,
          valor: parcela.valorOriginal,
        },
        dadosDepois: {
          descricao: dados.descricao,
          categoriaId: dados.categoriaId,
          clienteId: editaveis.pessoa ? dados.clienteId : titulo.clienteId,
          dataVencimento: editaveis.vencimento ? dados.dataVencimento : parcela.dataVencimento,
          valor: novoValor.paraTexto(),
        },
      });
    }, this.banco);
  }

  /**
   * Recebimento, movimentacao bancaria e novo saldo da parcela: uma transacao so.
   *
   * A parcela e travada com SELECT ... FOR UPDATE antes de qualquer conta. Sem
   * isso, dois cliques simultaneos no botao "Registrar recebimento" leriam o
   * mesmo saldo e gravariam duas baixas — a conta ficaria recebida em dobro,
   * com duas entradas de dinheiro que nunca aconteceram.
   *
   * Sobre os tres valores (principal, abatimento, saida no banco), ver o
   * cabecalho de `compartilhado/financeiro/validacao-de-baixa.ts`. Aqui a
   * traducao para o modelo: a coluna `valor_principal` guarda o ABATIMENTO, e
   * o CHECK do banco (`valor_recebido = principal + juros + multa - desconto`)
   * fecha a conta sozinho.
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
      const jaRecebido = Dinheiro.deTexto(parcela.valorRecebido);
      const saldo = saldoRestante({ valorOriginal: original, valorBaixado: jaRecebido });

      // Revalida DENTRO da transacao, com a linha travada: o saldo lido pela
      // tela pode estar velho.
      if (parcela.situacao !== "aberta") throw new Error("PARCELA_NAO_ESTA_ABERTA");
      if (!dados.valorPrincipal.ehPositivo()) throw new Error("VALOR_INVALIDO");
      if (dados.valorDesconto.ehNegativo() || dados.valorJuros.ehNegativo() || dados.valorMulta.ehNegativo()) {
        throw new Error("VALOR_INVALIDO");
      }

      const abatimento = abatimentoDaBaixa(dados.valorPrincipal, dados.valorDesconto);
      if (abatimento.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

      const entraNoBanco = valorQueMovimentaOBanco(dados.valorPrincipal, dados.valorJuros, dados.valorMulta);
      if (!entraNoBanco.ehPositivo()) throw new Error("VALOR_INVALIDO");

      const [titulo] = await transacao
        .select({ descricao: titulosReceber.descricao, codigo: titulosReceber.codigo, categoriaId: titulosReceber.categoriaId })
        .from(titulosReceber)
        .where(and(eq(titulosReceber.id, parcela.tituloId), eq(titulosReceber.empresaId, escopo.empresaId)))
        .limit(1);

      // A conta bancaria precisa ser DESTA empresa: sem esta checagem, receber
      // na conta de outra empresa seria possivel informando o UUID.
      await this.exigirContaDaEmpresa(transacao, escopo, dados.contaBancariaId);

      const [movimentacao] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: dados.contaBancariaId,
          dataMovimentacao: dados.dataRecebimento,
          tipo: "entrada",
          valor: entraNoBanco.paraTexto(),
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
          valorPrincipal: abatimento.paraTexto(),
          valorJuros: dados.valorJuros.paraTexto(),
          valorMulta: dados.valorMulta.paraTexto(),
          valorDesconto: dados.valorDesconto.paraTexto(),
          valorRecebido: entraNoBanco.paraTexto(),
          formaPagamento: dados.formaPagamento as "pix",
          situacao: "registrado",
          ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        })
        .returning({ id: recebimentos.id });

      const novoRecebido = jaRecebido.somar(abatimento);
      const quitada = !novoRecebido.menorQue(original);
      await transacao
        .update(parcelasReceber)
        .set({ valorRecebido: novoRecebido.paraTexto(), situacao: quitada ? "liquidada" : "aberta", atualizadoEm: new Date() })
        .where(and(eq(parcelasReceber.id, parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.paga",
        entidade: "parcela_receber",
        entidadeId: parcelaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          valorPrincipal: dados.valorPrincipal.paraTexto(),
          valorDesconto: dados.valorDesconto.paraTexto(),
          abatido: abatimento.paraTexto(),
          saiuDoBanco: entraNoBanco.paraTexto(),
          data: dados.dataRecebimento,
          quitada,
        },
      });

      return { recebimentoId: recebimento!.id };
    }, this.banco);
  }

  /**
   * Estorno: a baixa errada continua no historico, marcada, com uma
   * movimentacao inversa ao lado.
   *
   * Nao existe "desfazer" que apaga. Quem conferir o extrato do mes vai ver a
   * entrada e a saida — e e isso que bate com o extrato do banco de verdade,
   * onde o dinheiro tambem entrou e voltou.
   */
  async estornarRecebimento(escopo: EscopoEmpresa, recebimentoId: string, dados: DadosEstorno): Promise<{ parcelaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [recebimento] = await transacao
        .select({
          id: recebimentos.id,
          parcelaId: recebimentos.parcelaReceberId,
          contaBancariaId: recebimentos.contaBancariaId,
          movimentacaoId: recebimentos.movimentacaoBancariaId,
          valorPrincipal: recebimentos.valorPrincipal,
          valorRecebido: recebimentos.valorRecebido,
          situacao: recebimentos.situacao,
        })
        .from(recebimentos)
        .where(and(eq(recebimentos.id, recebimentoId), eq(recebimentos.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!recebimento) throw new Error("PAGAMENTO_NAO_ENCONTRADO");
      if (recebimento.situacao === "estornado") throw new Error("PAGAMENTO_JA_ESTORNADO");

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
        .where(and(eq(conciliacoesMovimentacoes.movimentacaoId, recebimento.movimentacaoId), eq(conciliacoesMovimentacoes.ativo, true)))
        .limit(1);
      if (conciliada) throw new Error("BAIXA_CONCILIADA");

      const [parcela] = await transacao
        .select({
          id: parcelasReceber.id,
          tituloId: parcelasReceber.tituloReceberId,
          valorOriginal: parcelasReceber.valorOriginal,
          valorRecebido: parcelasReceber.valorRecebido,
          situacao: parcelasReceber.situacao,
        })
        .from(parcelasReceber)
        .where(and(eq(parcelasReceber.id, recebimento.parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");
      if (parcela.situacao === "cancelada") throw new Error("PARCELA_CANCELADA");

      const [original] = await transacao
        .select({ descricao: movimentacoesBancarias.descricao, categoriaId: movimentacoesBancarias.categoriaId })
        .from(movimentacoesBancarias)
        .where(and(eq(movimentacoesBancarias.id, recebimento.movimentacaoId), eq(movimentacoesBancarias.empresaId, escopo.empresaId)))
        .limit(1);

      // Movimentacao inversa: o recebimento saiu, o estorno entra. Mesmo valor,
      // mesma conta, apontando para a movimentacao que desfaz.
      const [inversa] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: recebimento.contaBancariaId,
          dataMovimentacao: dados.dataEstorno,
          tipo: "saida",
          valor: recebimento.valorRecebido,
          descricao: `Estorno · ${original?.descricao ?? "recebimento"}`,
          origem: "estorno",
          movimentacaoEstornadaId: recebimento.movimentacaoId,
          ...(original?.categoriaId ? { categoriaId: original.categoriaId } : {}),
          observacoes: dados.motivo,
        })
        .returning({ id: movimentacoesBancarias.id });

      await transacao
        .update(recebimentos)
        .set({
          situacao: "estornado",
          estornadoEm: new Date(),
          motivoEstorno: dados.motivo,
          movimentacaoEstornoId: inversa!.id,
        })
        .where(and(eq(recebimentos.id, recebimentoId), eq(recebimentos.empresaId, escopo.empresaId)));

      // O que volta ao saldo e o ABATIMENTO (coluna `valor_principal`), nao o
      // que saiu do banco: juros e multa nunca abateram nada.
      const devolvido = Dinheiro.deTexto(recebimento.valorPrincipal);
      const novoRecebido = Dinheiro.deTexto(parcela.valorRecebido).subtrair(devolvido);
      const restaurado = novoRecebido.ehNegativo() ? Dinheiro.zero() : novoRecebido;

      await transacao
        .update(parcelasReceber)
        .set({ valorRecebido: restaurado.paraTexto(), situacao: "aberta", atualizadoEm: new Date() })
        .where(and(eq(parcelasReceber.id, parcela.id), eq(parcelasReceber.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.recebimento_estornado",
        entidade: "recebimento",
        entidadeId: recebimentoId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosAntes: { valorRecebido: parcela.valorRecebido, situacao: parcela.situacao },
        dadosDepois: {
          valorRecebido: restaurado.paraTexto(),
          situacao: "aberta",
          motivo: dados.motivo,
          movimentacaoEstorno: inversa!.id,
        },
      });

      return { parcelaId: parcela.id };
    }, this.banco);
  }

  /**
   * Cancelamento: o que ainda nao foi recebido deixa de ser cobrado.
   *
   * As baixas ja registradas continuam valendo — o dinheiro entrou de verdade e
   * apagar isso seria falsificar o extrato. Parcelas ja liquidadas ficam como
   * estao; so as em aberto viram `cancelada`. O motivo fica gravado no titulo.
   */
  async cancelar(escopo: EscopoEmpresa, tituloId: string, dados: DadosCancelamento): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const [titulo] = await transacao
        .select({ id: titulosReceber.id, situacao: titulosReceber.situacao, codigo: titulosReceber.codigo })
        .from(titulosReceber)
        .where(and(eq(titulosReceber.id, tituloId), eq(titulosReceber.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);

      if (!titulo) throw new Error("CONTA_NAO_ENCONTRADA");
      if (titulo.situacao === "cancelado") throw new Error("CONTA_JA_CANCELADA");

      const abertas = await transacao
        .select({ id: parcelasReceber.id })
        .from(parcelasReceber)
        .where(
          and(
            eq(parcelasReceber.tituloReceberId, tituloId),
            eq(parcelasReceber.empresaId, escopo.empresaId),
            eq(parcelasReceber.situacao, "aberta"),
          ),
        )
        .for("update");

      if (abertas.length > 0) {
        await transacao
          .update(parcelasReceber)
          .set({ situacao: "cancelada", atualizadoEm: new Date() })
          .where(
            and(
              inArray(
                parcelasReceber.id,
                abertas.map((p) => p.id),
              ),
              eq(parcelasReceber.empresaId, escopo.empresaId),
            ),
          );
      }

      await transacao
        .update(titulosReceber)
        .set({ situacao: "cancelado", canceladoEm: new Date(), motivoCancelamento: dados.motivo, atualizadoEm: new Date() })
        .where(and(eq(titulosReceber.id, tituloId), eq(titulosReceber.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conta_receber.cancelada",
        entidade: "titulo_receber",
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
      .select({ parcelaId: recebimentos.parcelaReceberId, total: sql<number>`count(*)::int` })
      .from(recebimentos)
      .innerJoin(parcelasReceber, eq(parcelasReceber.id, recebimentos.parcelaReceberId))
      .where(
        and(
          eq(parcelasReceber.tituloReceberId, tituloId),
          eq(recebimentos.empresaId, escopo.empresaId),
          eq(recebimentos.situacao, "registrado"),
        ),
      )
      .groupBy(recebimentos.parcelaReceberId);

    const noTitulo = linhas.reduce((soma, linha) => soma + linha.total, 0);
    const naParcela = parcelaId ? (linhas.find((l) => l.parcelaId === parcelaId)?.total ?? 0) : 0;
    return { noTitulo, naParcela };
  }

  private async historicoDaParcela(escopo: EscopoEmpresa, parcelaId: string): Promise<readonly RecebimentoRegistrado[]> {
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
        estornadoEm: recebimentos.estornadoEm,
        motivoEstorno: recebimentos.motivoEstorno,
        conciliacaoId: conciliacoesMovimentacoes.id,
      })
      .from(recebimentos)
      .innerJoin(contasBancarias, eq(contasBancarias.id, recebimentos.contaBancariaId))
      .leftJoin(
        conciliacoesMovimentacoes,
        and(eq(conciliacoesMovimentacoes.movimentacaoId, recebimentos.movimentacaoBancariaId), eq(conciliacoesMovimentacoes.ativo, true)),
      )
      .where(and(eq(recebimentos.parcelaReceberId, parcelaId), eq(recebimentos.empresaId, escopo.empresaId)))
      .orderBy(desc(recebimentos.dataRecebimento), desc(recebimentos.criadoEm));

    return historico.map((p): RecebimentoRegistrado => {
      const abatido = Dinheiro.deTexto(p.valorPrincipal);
      const desconto = Dinheiro.deTexto(p.valorDesconto);
      const estornado = p.situacao === "estornado";
      return {
        id: p.id,
        dataRecebimento: p.dataRecebimento as DataCivil,
        // A coluna guarda o abatimento; a tela fala de dinheiro.
        valorPrincipal: abatido.subtrair(desconto),
        valorJuros: Dinheiro.deTexto(p.valorJuros),
        valorMulta: Dinheiro.deTexto(p.valorMulta),
        valorDesconto: desconto,
        valorAbatido: abatido,
        valorRecebido: Dinheiro.deTexto(p.valorRecebido),
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
        parcelaId: parcelasReceber.id,
        numeroParcela: parcelasReceber.numeroParcela,
        dataVencimento: parcelasReceber.dataVencimento,
        valorOriginal: parcelasReceber.valorOriginal,
        valorRecebido: parcelasReceber.valorRecebido,
        situacaoParcela: parcelasReceber.situacao,
      })
      .from(parcelasReceber)
      .where(and(eq(parcelasReceber.tituloReceberId, tituloId), eq(parcelasReceber.empresaId, escopo.empresaId)))
      .orderBy(asc(parcelasReceber.numeroParcela));

    return linhas.map((linha) => {
      const calculo = this.paraCalculo(linha);
      return {
        parcelaId: linha.parcelaId,
        numeroParcela: linha.numeroParcela,
        dataVencimento: linha.dataVencimento as DataVencimento,
        valorOriginal: calculo.valorOriginal,
        valorRecebido: calculo.valorBaixado,
        saldo: saldoEmAberto(calculo),
        situacao: situacaoDerivada(calculo, hoje),
      };
    });
  }

  private colunasDaLista() {
    return {
      parcelaId: parcelasReceber.id,
      tituloId: parcelasReceber.tituloReceberId,
      codigo: titulosReceber.codigo,
      descricao: titulosReceber.descricao,
      clienteNome: pessoas.nome,
      categoriaNome: categoriasFinanceiras.nome,
      numeroParcela: parcelasReceber.numeroParcela,
      quantidadeParcelas: titulosReceber.quantidadeParcelas,
      dataVencimento: parcelasReceber.dataVencimento,
      valorOriginal: parcelasReceber.valorOriginal,
      valorRecebido: parcelasReceber.valorRecebido,
      situacaoParcela: parcelasReceber.situacao,
    };
  }

  private paraCalculo(linha: Record<string, unknown>) {
    return {
      valorOriginal: Dinheiro.deTexto(String(linha.valorOriginal)),
      valorBaixado: Dinheiro.deTexto(String(linha.valorRecebido)),
      dataVencimento: String(linha.dataVencimento) as DataVencimento,
      situacaoGravada: String(linha.situacaoParcela) as "aberta" | "liquidada" | "cancelada" | "perdida",
    };
  }

  private montarItem(linha: Record<string, unknown>, hoje: DataCivil): ContaReceberNaLista {
    const calculo = this.paraCalculo(linha);
    return {
      parcelaId: String(linha.parcelaId),
      tituloId: String(linha.tituloId),
      codigo: String(linha.codigo),
      descricao: String(linha.descricao),
      clienteNome: String(linha.clienteNome),
      categoriaNome: String(linha.categoriaNome),
      numeroParcela: Number(linha.numeroParcela),
      quantidadeParcelas: Number(linha.quantidadeParcelas),
      dataVencimento: calculo.dataVencimento,
      valorOriginal: calculo.valorOriginal,
      valorRecebido: calculo.valorBaixado,
      saldo: saldoEmAberto(calculo),
      valorCancelado: valorCancelado(calculo),
      situacao: situacaoDerivada(calculo, hoje) as SituacaoDerivada,
    };
  }

  private condicoesDeBusca(escopo: EscopoEmpresa, filtro: FiltroContasReceber, hoje: DataCivil): SQL[] {
    const condicoes: SQL[] = [eq(parcelasReceber.empresaId, escopo.empresaId)];
    if (filtro.busca) {
      const alvo = `%${filtro.busca}%`;
      const busca = or(ilike(titulosReceber.descricao, alvo), ilike(titulosReceber.codigo, alvo), ilike(pessoas.nome, alvo));
      if (busca) condicoes.push(busca);
    }
    if (filtro.situacoes?.length) {
      condicoes.push(filtroPorSituacaoDerivada(this.colunasDaSituacao(), hoje, filtro.situacoes));
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

/** A expressao SQL usada no filtro por situacao. Exportada para o teste de acordo com a versao TS. */
export function situacaoDerivadaDaParcelaReceber(hoje: DataCivil) {
  return situacaoDerivadaSql(
    {
      situacao: parcelasReceber.situacao,
      valorOriginal: parcelasReceber.valorOriginal,
      valorBaixado: parcelasReceber.valorRecebido,
      dataVencimento: parcelasReceber.dataVencimento,
    },
    hoje,
  );
}
