import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { compararDatas, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/* Tabelas de outros modulos vem do agregador: esquema nao e interface publica. */
import {
  categoriasFinanceiras,
  contasBancarias,
  extratosBancarios,
  itensExtratoBancario,
  movimentacoesBancarias,
  parcelasPagar,
  parcelasReceber,
} from "@/banco-dados/esquemas/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados, type TransacaoBancoDados } from "@/nucleo/banco-dados/publico";
/* Outro modulo, sempre pela porta da frente. */
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";
import { RepositorioContasReceberDrizzle } from "@/modulos/contas-receber/publico";

import { lerOfx, type LancamentoOfx } from "../dominio/ofx";
import {
  confiancaDeConciliacaoManual,
  sugerirConciliacoes,
  validarConciliacao,
  type ItemParaCasar,
  type MovimentacaoParaCasar,
} from "../dominio/sugestao-de-conciliacao";
import { conciliacoesBancarias, conciliacoesItensExtrato, conciliacoesMovimentacoes } from "./esquema";
import type {
  DadosBaixaDoItem,
  DadosConciliacao,
  DadosImportacaoOfx,
  DadosLancamentoDoItem,
  ImportacaoNaLista,
  ItemDoExtrato,
  MovimentacaoPendente,
  PainelDeConciliacao,
  RepositorioConciliacao,
  ResultadoImportacao,
} from "../aplicacao/repositorio-conciliacao";

/**
 * Conciliacao bancaria no PostgreSQL.
 *
 * O acordo do modelo (ver o cabecalho de `infraestrutura/esquema.ts`): um item
 * de extrato e uma movimentacao participam de NO MAXIMO UMA conciliacao ativa,
 * garantido por indice unico parcial. Desfazer nao apaga — marca
 * `desfeita_em` e desativa os vinculos.
 *
 * Duas coisas que valem a leitura:
 *
 * 1. DEDUPLICACAO. O identificador do banco (FITID) e unico por conta, e o
 *    indice `unico_itens_extrato_identificador` garante isso no banco. Quando
 *    nao ha FITID, entra a impressao digital da linha. Reimportar o mesmo
 *    arquivo nao cria nada novo; e isso que permite ao usuario reimportar sem
 *    medo quando nao tem certeza se o primeiro envio deu certo.
 *
 * 2. BAIXA A PARTIR DO EXTRATO. A transacao e aberta AQUI e entregue ao
 *    repositorio de contas a pagar/receber (que a usa como savepoint). Assim a
 *    baixa, a movimentacao e a conciliacao caem juntas ou nenhuma cai — sem
 *    isso, uma falha no meio deixaria a conta paga e o extrato ainda pendente.
 *
 * ISOLAMENTO: todo metodo filtra por `escopo.empresaId`, inclusive quando
 * recebe o UUID de um item.
 */
export class RepositorioConciliacaoDrizzle implements RepositorioConciliacao {
  constructor(private readonly banco: ExecutorBancoDados) {}

  // ----------------------------------------------------------- importacao

  async importarOfx(escopo: EscopoEmpresa, dados: DadosImportacaoOfx): Promise<ResultadoImportacao> {
    const extrato = lerOfx(dados.conteudo);

    return executarEmTransacao(async (transacao) => {
      const [conta] = await transacao
        .select({
          id: contasBancarias.id,
          nome: contasBancarias.nome,
          agencia: contasBancarias.agencia,
          numeroConta: contasBancarias.numeroConta,
        })
        .from(contasBancarias)
        .where(and(eq(contasBancarias.id, dados.contaBancariaId), eq(contasBancarias.empresaId, escopo.empresaId)))
        .limit(1);
      if (!conta) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");

      /*
       * A conta do arquivo tem de ser a conta escolhida. Importar o extrato do
       * BB dentro do Itau bagunca dois saldos de uma vez, e o erro so aparece
       * quando nenhum dos dois fecha. Numeros de conta variam de formato entre
       * bancos (com e sem digito, com e sem zeros a esquerda), entao a
       * comparacao ignora o que nao e digito — e, divergindo, PERGUNTA em vez
       * de decidir.
       */
      if (!dados.confirmouContaDivergente && divergem(conta.numeroConta, extrato.conta.numeroConta)) {
        throw new Error("CONTA_DIVERGENTE");
      }

      const impressaoArquivo = await impressaoDigitalDe(dados.conteudo);

      const [jaImportado] = await transacao
        .select({ id: extratosBancarios.id })
        .from(extratosBancarios)
        .where(
          and(
            eq(extratosBancarios.contaBancariaId, dados.contaBancariaId),
            eq(extratosBancarios.impressaoDigital, impressaoArquivo),
          ),
        )
        .limit(1);

      const [lote] = jaImportado
        ? [jaImportado]
        : await transacao
            .insert(extratosBancarios)
            .values({
              empresaId: escopo.empresaId,
              contaBancariaId: dados.contaBancariaId,
              formato: "ofx",
              nomeArquivoOriginal: dados.nomeArquivo,
              impressaoDigital: impressaoArquivo,
              dataInicio: extrato.dataInicio,
              dataFim: extrato.dataFim,
              saldoFinalInformado: extrato.saldoFinalInformado?.paraTexto() ?? null,
              quantidadeItens: extrato.lancamentos.length,
              importadoPorUsuarioId: dados.usuarioId,
            })
            .returning({ id: extratosBancarios.id });

      let importados = 0;
      let duplicados = 0;

      for (const [posicao, lancamento] of extrato.lancamentos.entries()) {
        const impressaoLinha = await impressaoDaLinha(dados.contaBancariaId, lancamento, posicao);
        const inseridos = await transacao
          .insert(itensExtratoBancario)
          .values({
            extratoBancarioId: lote!.id,
            contaBancariaId: dados.contaBancariaId,
            dataMovimentacao: lancamento.data,
            tipo: lancamento.tipo,
            valor: lancamento.valor.paraTexto(),
            descricao: lancamento.descricao,
            identificadorExterno: lancamento.identificadorExterno,
            impressaoDigitalLinha: impressaoLinha,
            numeroDocumento: lancamento.numeroDocumento,
            dadosBrutos: lancamento.dadosBrutos,
          })
          // A deduplicacao acontece no BANCO, nos dois indices unicos: FITID
          // por conta e impressao da linha por conta. Conferir antes com um
          // SELECT deixaria uma janela de corrida entre a leitura e a escrita.
          .onConflictDoNothing()
          .returning({ id: itensExtratoBancario.id });

        if (inseridos.length > 0) importados += 1;
        else duplicados += 1;
      }

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "extrato.importado",
        entidade: "extrato_bancario",
        entidadeId: lote!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: {
          arquivo: dados.nomeArquivo,
          conta: conta.nome,
          importados,
          duplicados,
          periodo: `${extrato.dataInicio ?? "?"} a ${extrato.dataFim ?? "?"}`,
        },
      });

      return {
        extratoId: lote!.id,
        importados,
        duplicados,
        dataInicio: extrato.dataInicio,
        dataFim: extrato.dataFim,
        saldoInformado: extrato.saldoFinalInformado,
      };
    }, this.banco);
  }

  async listarImportacoes(escopo: EscopoEmpresa, contaBancariaId: string): Promise<readonly ImportacaoNaLista[]> {
    const linhas = await this.banco.execute<{
      id: string; nome: string; importado_em: string; autor: string | null;
      data_inicio: string | null; data_fim: string | null; quantidade: number;
    }>(sql`
      SELECT e.id::text AS id, e.nome_arquivo_original AS nome, e.importado_em::text AS importado_em,
             u.name AS autor, e.data_inicio::text AS data_inicio, e.data_fim::text AS data_fim,
             e.quantidade_itens AS quantidade
      FROM extratos_bancarios e
      LEFT JOIN "user" u ON u.id = e.importado_por_usuario_id
      WHERE e.empresa_id = ${escopo.empresaId} AND e.conta_bancaria_id = ${contaBancariaId}
      ORDER BY e.importado_em DESC
      LIMIT 50
    `);

    return [...linhas].map((linha) => ({
      id: linha.id,
      nomeArquivo: linha.nome,
      importadoEm: new Date(linha.importado_em),
      importadoPorNome: linha.autor,
      dataInicio: (linha.data_inicio as DataCivil | null) ?? null,
      dataFim: (linha.data_fim as DataCivil | null) ?? null,
      quantidadeItens: Number(linha.quantidade),
    }));
  }

  // --------------------------------------------------------------- painel

  async montarPainel(escopo: EscopoEmpresa, contaBancariaId: string, hoje: DataCivil): Promise<PainelDeConciliacao | null> {
    const [conta] = await this.banco
      .select({ id: contasBancarias.id, nome: contasBancarias.nome, saldoInicial: contasBancarias.saldoInicial })
      .from(contasBancarias)
      .where(and(eq(contasBancarias.id, contaBancariaId), eq(contasBancarias.empresaId, escopo.empresaId)))
      .limit(1);
    if (!conta) return null;

    const [itens, movimentacoes, ultimoExtrato, saldoDoSistema] = await Promise.all([
      this.itensDoExtrato(escopo, contaBancariaId),
      this.movimentacoesPendentes(escopo, contaBancariaId),
      this.ultimoExtrato(escopo, contaBancariaId),
      this.saldoDoSistema(escopo, contaBancariaId, hoje),
    ]);

    const pendentes = itens.filter((item) => !item.conciliado && !item.ignorado);
    const sugestoes = sugerirConciliacoes(
      pendentes.map((item): ItemParaCasar => ({ id: item.id, data: item.data, tipo: item.tipo, valor: item.valor })),
      movimentacoes.map((m): MovimentacaoParaCasar => ({ id: m.id, data: m.data, tipo: m.tipo, valor: m.valor })),
    );
    const porItem = new Map(sugestoes.map((sugestao) => [sugestao.itemId, sugestao]));

    const itensComSugestao = itens.map((item): ItemDoExtrato => {
      const sugestao = porItem.get(item.id);
      return {
        ...item,
        candidatas: sugestao?.candidatas ?? [],
        confianca: sugestao?.confianca ?? "revisao",
        exata: sugestao?.exata ?? false,
      };
    });

    const saldoDoExtrato = ultimoExtrato?.saldo ?? null;
    /*
     * A diferenca so faz sentido quando o saldo do sistema e lido ATE a data
     * do extrato. Comparar o saldo de hoje com o saldo do banco no dia 30
     * acusaria diferenca sempre que houvesse lancamento depois do dia 30.
     */
    const saldoComparavel = ultimoExtrato?.dataFim
      ? await this.saldoDoSistema(escopo, contaBancariaId, ultimoExtrato.dataFim)
      : saldoDoSistema;

    return {
      contaBancariaId,
      contaNome: conta.nome,
      itens: itensComSugestao,
      movimentacoes,
      resumo: {
        saldoDoExtrato,
        saldoDoSistema: saldoComparavel,
        diferenca: saldoDoExtrato ? saldoDoExtrato.subtrair(saldoComparavel) : null,
        itensPendentes: pendentes.length,
        movimentacoesPendentes: movimentacoes.length,
        sugestoesExatas: sugestoes.filter((sugestao) => sugestao.exata).length,
      },
      temExtrato: itens.length > 0,
    };
  }

  private async itensDoExtrato(
    escopo: EscopoEmpresa,
    contaBancariaId: string,
  ): Promise<readonly Omit<ItemDoExtrato, "candidatas" | "confianca" | "exata">[]> {
    const linhas = await this.banco
      .select({
        id: itensExtratoBancario.id,
        data: itensExtratoBancario.dataMovimentacao,
        tipo: itensExtratoBancario.tipo,
        valor: itensExtratoBancario.valor,
        descricao: itensExtratoBancario.descricao,
        numeroDocumento: itensExtratoBancario.numeroDocumento,
        ignoradoEm: itensExtratoBancario.ignoradoEm,
        motivoIgnorar: itensExtratoBancario.motivoIgnorar,
        conciliacaoId: conciliacoesItensExtrato.conciliacaoId,
      })
      .from(itensExtratoBancario)
      .innerJoin(extratosBancarios, eq(extratosBancarios.id, itensExtratoBancario.extratoBancarioId))
      .leftJoin(
        conciliacoesItensExtrato,
        and(eq(conciliacoesItensExtrato.itemExtratoId, itensExtratoBancario.id), eq(conciliacoesItensExtrato.ativo, true)),
      )
      .where(and(eq(itensExtratoBancario.contaBancariaId, contaBancariaId), eq(extratosBancarios.empresaId, escopo.empresaId)))
      .orderBy(asc(itensExtratoBancario.dataMovimentacao), asc(itensExtratoBancario.id))
      .limit(500);

    return linhas.map((linha) => ({
      id: linha.id,
      data: linha.data as DataCivil,
      tipo: linha.tipo,
      valor: Dinheiro.deTexto(linha.valor),
      descricao: linha.descricao,
      numeroDocumento: linha.numeroDocumento,
      conciliado: linha.conciliacaoId !== null,
      ignorado: linha.ignoradoEm !== null,
      motivoIgnorar: linha.motivoIgnorar,
      conciliacaoId: linha.conciliacaoId,
    }));
  }

  private async movimentacoesPendentes(escopo: EscopoEmpresa, contaBancariaId: string): Promise<readonly MovimentacaoPendente[]> {
    const linhas = await this.banco
      .select({
        id: movimentacoesBancarias.id,
        data: movimentacoesBancarias.dataMovimentacao,
        tipo: movimentacoesBancarias.tipo,
        valor: movimentacoesBancarias.valor,
        descricao: movimentacoesBancarias.descricao,
        origem: movimentacoesBancarias.origem,
        categoriaNome: categoriasFinanceiras.nome,
      })
      .from(movimentacoesBancarias)
      .leftJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, movimentacoesBancarias.categoriaId))
      .leftJoin(
        conciliacoesMovimentacoes,
        and(eq(conciliacoesMovimentacoes.movimentacaoId, movimentacoesBancarias.id), eq(conciliacoesMovimentacoes.ativo, true)),
      )
      .where(
        and(
          eq(movimentacoesBancarias.empresaId, escopo.empresaId),
          eq(movimentacoesBancarias.contaBancariaId, contaBancariaId),
          isNull(conciliacoesMovimentacoes.id),
        ),
      )
      .orderBy(asc(movimentacoesBancarias.dataMovimentacao), asc(movimentacoesBancarias.criadoEm))
      .limit(500);

    return linhas.map(
      (linha): MovimentacaoPendente => ({
        id: linha.id,
        data: linha.data as DataCivil,
        tipo: linha.tipo,
        valor: Dinheiro.deTexto(linha.valor),
        descricao: linha.descricao,
        origem: linha.origem,
        categoriaNome: linha.categoriaNome,
      }),
    );
  }

  private async ultimoExtrato(
    escopo: EscopoEmpresa,
    contaBancariaId: string,
  ): Promise<{ saldo: Dinheiro | null; dataFim: DataCivil | null } | null> {
    const [linha] = await this.banco
      .select({ saldo: extratosBancarios.saldoFinalInformado, dataFim: extratosBancarios.dataFim })
      .from(extratosBancarios)
      .where(and(eq(extratosBancarios.contaBancariaId, contaBancariaId), eq(extratosBancarios.empresaId, escopo.empresaId)))
      .orderBy(desc(extratosBancarios.dataFim), desc(extratosBancarios.importadoEm))
      .limit(1);
    if (!linha) return null;
    return { saldo: linha.saldo ? Dinheiro.deTexto(linha.saldo) : null, dataFim: (linha.dataFim as DataCivil | null) ?? null };
  }

  private async saldoDoSistema(escopo: EscopoEmpresa, contaBancariaId: string, ate: DataCivil): Promise<Dinheiro> {
    const [linha] = await this.banco.execute<{ saldo: string }>(sql`
      SELECT (
        COALESCE((SELECT c.saldo_inicial FROM contas_bancarias c
                  WHERE c.id = ${contaBancariaId} AND c.empresa_id = ${escopo.empresaId}), 0)
        + COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
                    FROM movimentacoes_bancarias m
                    WHERE m.conta_bancaria_id = ${contaBancariaId}
                      AND m.empresa_id = ${escopo.empresaId}
                      AND m.data_movimentacao <= ${ate}::date), 0)
      )::text AS saldo
    `);
    return Dinheiro.deTexto(linha?.saldo ?? "0");
  }

  // ----------------------------------------------------------- conciliar

  async conciliar(escopo: EscopoEmpresa, dados: DadosConciliacao): Promise<{ conciliacaoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const { itens, movimentacoes } = await this.travarSelecao(transacao, escopo, dados);

      const conferencia = validarConciliacao(
        itens.map((i) => ({ id: i.id, data: i.data, tipo: i.tipo, valor: i.valor })),
        movimentacoes.map((m) => ({ id: m.id, data: m.data, tipo: m.tipo, valor: m.valor })),
      );
      if (!conferencia.sucesso) throw new Error(`DESEQUILIBRADA:${conferencia.erro.message}`);

      return this.gravarConciliacao(transacao, escopo, {
        contaBancariaId: dados.contaBancariaId,
        itensExtratoIds: itens.map((i) => i.id),
        movimentacaoIds: movimentacoes.map((m) => m.id),
        data: itens[0]!.data,
        confianca: confiancaDeConciliacaoManual(itens.length, movimentacoes.length),
        origemDecisao: dados.origemDecisao,
        usuarioId: dados.usuarioId,
      });
    }, this.banco);
  }

  async aceitarSugestoesExatas(
    escopo: EscopoEmpresa,
    contaBancariaId: string,
    usuarioId: string,
  ): Promise<{ conciliadas: number }> {
    const painel = await this.montarPainel(escopo, contaBancariaId, "9999-12-31" as DataCivil);
    if (!painel) throw new Error("CONTA_BANCARIA_NAO_ENCONTRADA");

    const exatas = painel.itens.filter((item) => item.exata && item.candidatas.length === 1);
    let conciliadas = 0;

    /*
     * Uma conciliacao por vez, cada uma na sua transacao. Se a decima falhar
     * (porque alguem conciliou aquela movimentacao noutra aba entre o calculo
     * e a gravacao), as nove anteriores continuam valendo e o usuario ve a
     * contagem real, em vez de perder o lote inteiro.
     */
    for (const item of exatas) {
      try {
        await this.conciliar(escopo, {
          contaBancariaId,
          itensExtratoIds: [item.id],
          movimentacaoIds: [item.candidatas[0]!.movimentacaoId],
          origemDecisao: "lote",
          usuarioId,
        });
        conciliadas += 1;
      } catch {
        // Concorrencia: a movimentacao deixou de estar disponivel. Segue.
      }
    }

    return { conciliadas };
  }

  async desconciliar(escopo: EscopoEmpresa, conciliacaoId: string, dados: { motivo: string; usuarioId: string }): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      if (!dados.motivo.trim()) throw new Error("MOTIVO_OBRIGATORIO");

      const [conciliacao] = await transacao
        .select({ id: conciliacoesBancarias.id, desfeitaEm: conciliacoesBancarias.desfeitaEm })
        .from(conciliacoesBancarias)
        .where(and(eq(conciliacoesBancarias.id, conciliacaoId), eq(conciliacoesBancarias.empresaId, escopo.empresaId)))
        .for("update")
        .limit(1);
      if (!conciliacao) throw new Error("CONCILIACAO_NAO_ENCONTRADA");
      if (conciliacao.desfeitaEm) throw new Error("CONCILIACAO_JA_DESFEITA");

      // Os vinculos sao DESATIVADOS, nao apagados: a decisao de um dia
      // continua no historico, e o indice unico parcial volta a liberar o
      // item e a movimentacao para uma nova conciliacao.
      await transacao
        .update(conciliacoesItensExtrato)
        .set({ ativo: false })
        .where(eq(conciliacoesItensExtrato.conciliacaoId, conciliacaoId));
      await transacao
        .update(conciliacoesMovimentacoes)
        .set({ ativo: false })
        .where(eq(conciliacoesMovimentacoes.conciliacaoId, conciliacaoId));

      await transacao
        .update(conciliacoesBancarias)
        .set({ desfeitaEm: new Date(), motivoDesfazer: dados.motivo.trim(), desfeitaPorUsuarioId: dados.usuarioId })
        .where(and(eq(conciliacoesBancarias.id, conciliacaoId), eq(conciliacoesBancarias.empresaId, escopo.empresaId)));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conciliacao.desfeita",
        entidade: "conciliacao_bancaria",
        entidadeId: conciliacaoId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: { motivo: dados.motivo.trim() },
      });
    }, this.banco);
  }

  async ignorarItem(escopo: EscopoEmpresa, itemId: string, dados: { motivo: string; usuarioId: string }): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      if (!dados.motivo.trim()) throw new Error("MOTIVO_OBRIGATORIO");
      const item = await this.travarItem(transacao, escopo, itemId);
      if (item.conciliado) throw new Error("ITEM_JA_CONCILIADO");

      await transacao
        .update(itensExtratoBancario)
        .set({ ignoradoEm: new Date(), motivoIgnorar: dados.motivo.trim() })
        .where(eq(itensExtratoBancario.id, itemId));

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "conciliacao.item_ignorado",
        entidade: "item_extrato_bancario",
        entidadeId: itemId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
        origem: "interface",
        dadosDepois: { motivo: dados.motivo.trim(), descricao: item.descricao, valor: item.valor.paraTexto() },
      });
    }, this.banco);
  }

  // ------------------------------------------- criar a partir do extrato

  async criarLancamentoDoItem(
    escopo: EscopoEmpresa,
    itemId: string,
    dados: DadosLancamentoDoItem,
  ): Promise<{ movimentacaoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const item = await this.travarItem(transacao, escopo, itemId);
      if (item.conciliado) throw new Error("ITEM_JA_CONCILIADO");
      if (item.ignorado) throw new Error("ITEM_IGNORADO");

      const [categoria] = await transacao
        .select({ id: categoriasFinanceiras.id })
        .from(categoriasFinanceiras)
        .where(and(eq(categoriasFinanceiras.id, dados.categoriaId), eq(categoriasFinanceiras.empresaId, escopo.empresaId)))
        .limit(1);
      if (!categoria) throw new Error("CATEGORIA_NAO_ENCONTRADA");

      const [movimentacao] = await transacao
        .insert(movimentacoesBancarias)
        .values({
          empresaId: escopo.empresaId,
          contaBancariaId: item.contaBancariaId,
          dataMovimentacao: item.data,
          tipo: item.tipo,
          valor: item.valor.paraTexto(),
          descricao: item.descricao,
          // `origem = 'extrato'` diz que a linha nasceu do arquivo do banco, e
          // e por isso que o modelo EXIGE categoria aqui (CHECK): lancamento
          // avulso sem classificacao vira dinheiro que ninguem explica.
          origem: "extrato",
          categoriaId: dados.categoriaId,
        })
        .returning({ id: movimentacoesBancarias.id });

      await this.gravarConciliacao(transacao, escopo, {
        contaBancariaId: item.contaBancariaId,
        itensExtratoIds: [itemId],
        movimentacaoIds: [movimentacao!.id],
        data: item.data,
        confianca: "alta",
        origemDecisao: "manual",
        usuarioId: dados.usuarioId,
      });

      return { movimentacaoId: movimentacao!.id };
    }, this.banco);
  }

  /**
   * Da baixa numa parcela a partir de uma linha do extrato, e ja concilia.
   *
   * A transacao e aberta aqui e ENTREGUE ao repositorio da outra area, que a
   * usa como savepoint. Baixa, movimentacao e conciliacao caem juntas.
   */
  async criarBaixaDoItem(escopo: EscopoEmpresa, itemId: string, dados: DadosBaixaDoItem): Promise<{ movimentacaoId: string }> {
    return executarEmTransacao(async (transacao) => {
      const item = await this.travarItem(transacao, escopo, itemId);
      if (item.conciliado) throw new Error("ITEM_JA_CONCILIADO");
      if (item.ignorado) throw new Error("ITEM_IGNORADO");

      const sentidoEsperado = dados.area === "pagar" ? "saida" : "entrada";
      if (item.tipo !== sentidoEsperado) throw new Error("SENTIDO_INCOMPATIVEL");

      const movimentacaoId = await (dados.area === "pagar"
        ? this.baixarContaPagar(transacao, escopo, item, dados)
        : this.baixarContaReceber(transacao, escopo, item, dados));

      await this.gravarConciliacao(transacao, escopo, {
        contaBancariaId: item.contaBancariaId,
        itensExtratoIds: [itemId],
        movimentacaoIds: [movimentacaoId],
        data: item.data,
        confianca: "alta",
        origemDecisao: "manual",
        usuarioId: dados.usuarioId,
      });

      return { movimentacaoId };
    }, this.banco);
  }

  private async baixarContaPagar(
    transacao: TransacaoBancoDados,
    escopo: EscopoEmpresa,
    item: ItemTravado,
    dados: DadosBaixaDoItem,
  ): Promise<string> {
    const [parcela] = await transacao
      .select({ valorOriginal: parcelasPagar.valorOriginal, valorPago: parcelasPagar.valorPago })
      .from(parcelasPagar)
      .where(and(eq(parcelasPagar.id, dados.parcelaId), eq(parcelasPagar.empresaId, escopo.empresaId)))
      .limit(1);
    if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

    const saldo = Dinheiro.deTexto(parcela.valorOriginal).subtrair(Dinheiro.deTexto(parcela.valorPago));
    if (item.valor.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

    const repositorio = new RepositorioContasPagarDrizzle(transacao);
    const { pagamentoId } = await repositorio.registrarPagamento(escopo, dados.parcelaId, {
      contaBancariaId: item.contaBancariaId,
      dataPagamento: item.data,
      valorPrincipal: item.valor,
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: dados.formaPagamento,
      observacoes: `Baixa criada a partir do extrato: ${item.descricao}`,
      usuarioId: dados.usuarioId,
    });

    const [movimentacao] = await transacao
      .select({ id: sql<string>`movimentacao_bancaria_id::text` })
      .from(sql`pagamentos`)
      .where(sql`id = ${pagamentoId}`);
    return movimentacao!.id;
  }

  private async baixarContaReceber(
    transacao: TransacaoBancoDados,
    escopo: EscopoEmpresa,
    item: ItemTravado,
    dados: DadosBaixaDoItem,
  ): Promise<string> {
    const [parcela] = await transacao
      .select({ valorOriginal: parcelasReceber.valorOriginal, valorRecebido: parcelasReceber.valorRecebido })
      .from(parcelasReceber)
      .where(and(eq(parcelasReceber.id, dados.parcelaId), eq(parcelasReceber.empresaId, escopo.empresaId)))
      .limit(1);
    if (!parcela) throw new Error("PARCELA_NAO_ENCONTRADA");

    const saldo = Dinheiro.deTexto(parcela.valorOriginal).subtrair(Dinheiro.deTexto(parcela.valorRecebido));
    if (item.valor.maiorQue(saldo)) throw new Error("VALOR_ACIMA_DO_SALDO");

    const repositorio = new RepositorioContasReceberDrizzle(transacao);
    const { recebimentoId } = await repositorio.registrarRecebimento(escopo, dados.parcelaId, {
      contaBancariaId: item.contaBancariaId,
      dataRecebimento: item.data,
      valorPrincipal: item.valor,
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: dados.formaPagamento,
      observacoes: `Baixa criada a partir do extrato: ${item.descricao}`,
      usuarioId: dados.usuarioId,
    });

    const [movimentacao] = await transacao
      .select({ id: sql<string>`movimentacao_bancaria_id::text` })
      .from(sql`recebimentos`)
      .where(sql`id = ${recebimentoId}`);
    return movimentacao!.id;
  }

  // ----------------------------------------------------------------- apoio

  private async travarItem(transacao: TransacaoBancoDados, escopo: EscopoEmpresa, itemId: string): Promise<ItemTravado> {
    const [linha] = await transacao
      .select({
        id: itensExtratoBancario.id,
        contaBancariaId: itensExtratoBancario.contaBancariaId,
        data: itensExtratoBancario.dataMovimentacao,
        tipo: itensExtratoBancario.tipo,
        valor: itensExtratoBancario.valor,
        descricao: itensExtratoBancario.descricao,
        ignoradoEm: itensExtratoBancario.ignoradoEm,
      })
      .from(itensExtratoBancario)
      .innerJoin(extratosBancarios, eq(extratosBancarios.id, itensExtratoBancario.extratoBancarioId))
      .where(and(eq(itensExtratoBancario.id, itemId), eq(extratosBancarios.empresaId, escopo.empresaId)))
      .limit(1);
    if (!linha) throw new Error("ITEM_NAO_ENCONTRADO");

    const [vinculo] = await transacao
      .select({ id: conciliacoesItensExtrato.id })
      .from(conciliacoesItensExtrato)
      .where(and(eq(conciliacoesItensExtrato.itemExtratoId, itemId), eq(conciliacoesItensExtrato.ativo, true)))
      .limit(1);

    return {
      id: linha.id,
      contaBancariaId: linha.contaBancariaId,
      data: linha.data as DataCivil,
      tipo: linha.tipo,
      valor: Dinheiro.deTexto(linha.valor),
      descricao: linha.descricao,
      ignorado: linha.ignoradoEm !== null,
      conciliado: Boolean(vinculo),
    };
  }

  private async travarSelecao(
    transacao: TransacaoBancoDados,
    escopo: EscopoEmpresa,
    dados: DadosConciliacao,
  ): Promise<{ itens: ItemTravado[]; movimentacoes: MovimentacaoTravada[] }> {
    if (dados.itensExtratoIds.length === 0 || dados.movimentacaoIds.length === 0) throw new Error("SELECAO_VAZIA");

    const itens: ItemTravado[] = [];
    for (const itemId of dados.itensExtratoIds) {
      const item = await this.travarItem(transacao, escopo, itemId);
      if (item.conciliado) throw new Error("ITEM_JA_CONCILIADO");
      if (item.ignorado) throw new Error("ITEM_IGNORADO");
      if (item.contaBancariaId !== dados.contaBancariaId) throw new Error("ITEM_DE_OUTRA_CONTA");
      itens.push(item);
    }

    const linhas = await transacao
      .select({
        id: movimentacoesBancarias.id,
        contaBancariaId: movimentacoesBancarias.contaBancariaId,
        data: movimentacoesBancarias.dataMovimentacao,
        tipo: movimentacoesBancarias.tipo,
        valor: movimentacoesBancarias.valor,
      })
      .from(movimentacoesBancarias)
      .where(
        and(
          inArray(movimentacoesBancarias.id, [...dados.movimentacaoIds]),
          eq(movimentacoesBancarias.empresaId, escopo.empresaId),
          eq(movimentacoesBancarias.contaBancariaId, dados.contaBancariaId),
        ),
      )
      .for("update");
    if (linhas.length !== dados.movimentacaoIds.length) throw new Error("MOVIMENTACAO_NAO_ENCONTRADA");

    return {
      itens,
      movimentacoes: linhas.map((linha) => ({
        id: linha.id,
        data: linha.data as DataCivil,
        tipo: linha.tipo,
        valor: Dinheiro.deTexto(linha.valor),
      })),
    };
  }

  private async gravarConciliacao(
    transacao: TransacaoBancoDados,
    escopo: EscopoEmpresa,
    dados: {
      contaBancariaId: string;
      itensExtratoIds: readonly string[];
      movimentacaoIds: readonly string[];
      data: DataCivil;
      confianca: "alta" | "possivel" | "revisao";
      origemDecisao: "manual" | "sugestao_aceita" | "lote";
      usuarioId: string;
    },
  ): Promise<{ conciliacaoId: string }> {
    const [conciliacao] = await transacao
      .insert(conciliacoesBancarias)
      .values({
        empresaId: escopo.empresaId,
        contaBancariaId: dados.contaBancariaId,
        dataConciliacao: dados.data,
        confianca: dados.confianca,
        origemDecisao: dados.origemDecisao,
        decididaPorUsuarioId: dados.usuarioId,
      })
      .returning({ id: conciliacoesBancarias.id });

    await transacao.insert(conciliacoesItensExtrato).values(
      dados.itensExtratoIds.map((itemExtratoId) => ({ conciliacaoId: conciliacao!.id, itemExtratoId, ativo: true })),
    );
    await transacao.insert(conciliacoesMovimentacoes).values(
      dados.movimentacaoIds.map((movimentacaoId) => ({ conciliacaoId: conciliacao!.id, movimentacaoId, ativo: true })),
    );

    await new RegistradorAuditoriaDrizzle(transacao).registrar({
      acao: "conciliacao.realizada",
      entidade: "conciliacao_bancaria",
      entidadeId: conciliacao!.id,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
      origem: "interface",
      dadosDepois: {
        itens: dados.itensExtratoIds.length,
        movimentacoes: dados.movimentacaoIds.length,
        confianca: dados.confianca,
        origemDecisao: dados.origemDecisao,
      },
    });

    return { conciliacaoId: conciliacao!.id };
  }
}

interface ItemTravado {
  readonly id: string;
  readonly contaBancariaId: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly descricao: string;
  readonly ignorado: boolean;
  readonly conciliado: boolean;
}

interface MovimentacaoTravada {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
}

/** Compara numeros de conta ignorando pontuacao e zeros a esquerda. */
function divergem(cadastrado: string | null, doArquivo: string | null): boolean {
  if (!cadastrado || !doArquivo) return false;
  const limpar = (texto: string) => texto.replace(/\D/g, "").replace(/^0+/, "");
  return limpar(cadastrado) !== limpar(doArquivo);
}

async function impressaoDigitalDe(conteudo: Uint8Array): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", conteudo as unknown as ArrayBuffer);
  return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Impressao digital de UMA linha do extrato.
 *
 * Existe para os arquivos sem FITID (CSV e alguns OFX antigos): sem
 * identificador do banco, a unica forma de reconhecer a mesma linha numa
 * reimportacao e o conjunto conta + data + tipo + valor + descricao + posicao.
 * A posicao entra porque dois lancamentos idênticos no mesmo dia sao normais
 * (duas tarifas iguais), e sem ela o segundo seria descartado como duplicata.
 */
async function impressaoDaLinha(contaBancariaId: string, lancamento: LancamentoOfx, posicao: number): Promise<string> {
  const chave = [
    contaBancariaId,
    lancamento.data,
    lancamento.tipo,
    lancamento.valor.paraTexto(),
    lancamento.descricao,
    lancamento.identificadorExterno ?? `pos:${posicao}`,
  ].join("|");
  return impressaoDigitalDe(new TextEncoder().encode(chave));
}

/** Ordena por data; usado pelos testes de painel. */
export function ordenarPorData<T extends { data: DataCivil }>(linhas: readonly T[]): readonly T[] {
  return [...linhas].sort((a, b) => compararDatas(a.data, b.data));
}
