import { and, count, desc, eq, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";

import type { DataCivil } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { arquivos, empresas } from "@/banco-dados/esquemas/indice";
import { ACOES_AUDITORIA, RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { GeradorCodigoPostgres, PREFIXOS_CODIGO } from "@/nucleo/codigos/publico";
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";

import { ABANDONO_DIAS, dataCivilDoInstante, DocumentoNaoEncontrado, DocumentoNaoPendente, DocumentoNaoReabrivel, podeReabrir } from "../dominio/conferencia";

import type {
  AnexoDoDocumento, DadosDeAprovacao, DadosDoEnvio, DocumentoDetalhado, DocumentoNaFila, EscopoResolvidoPorToken, FiltroDaFila,
  RepositorioCaptura, TokenDeCapturaAtivo,
} from "../aplicacao/repositorio-captura";
import { anexosDocumentosCapturados, documentosCapturados, tentativasCaptura, tokensCaptura } from "./esquema";

/**
 * Tokens de captura contra PostgreSQL.
 *
 * Toda consulta filtra por `empresa_id` do escopo. A unica que nao recebe
 * escopo e `resolverEscopoPorToken`, que o PRODUZ — ver o contrato.
 */
export class RepositorioCapturaDrizzle implements RepositorioCaptura {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async obterTokenAtivo(escopo: EscopoEmpresa): Promise<TokenDeCapturaAtivo | null> {
    const [linha] = await this.banco
      .select({
        id: tokensCaptura.id,
        criadoEm: tokensCaptura.criadoEm,
        criadoPor: tokensCaptura.criadoPor,
        limiteEnviosHora: tokensCaptura.limiteEnviosHora,
      })
      .from(tokensCaptura)
      .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
      .limit(1);
    return linha ?? null;
  }

  async gerarToken(
    escopo: EscopoEmpresa,
    dados: { readonly tokenHash: string; readonly autorUsuarioId: string },
  ): Promise<{ readonly id: string; readonly substituiuAnterior: boolean }> {
    return executarEmTransacao(async (transacao) => {
      const agora = new Date();
      const revogados = await transacao
        .update(tokensCaptura)
        .set({ revogadoEm: agora, revogadoPor: dados.autorUsuarioId })
        .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
        .returning({ id: tokensCaptura.id });

      for (const revogado of revogados) {
        await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaRevogado, revogado.id, {
          motivo: "substituido",
        });
      }

      const [criado] = await transacao
        .insert(tokensCaptura)
        .values({ empresaId: escopo.empresaId, tokenHash: dados.tokenHash, criadoPor: dados.autorUsuarioId })
        .returning({ id: tokensCaptura.id });

      await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaGerado, criado!.id, {
        substituiuAnterior: revogados.length > 0,
      });

      return { id: criado!.id, substituiuAnterior: revogados.length > 0 };
    }, this.banco);
  }

  async revogarToken(escopo: EscopoEmpresa, dados: { readonly autorUsuarioId: string }): Promise<boolean> {
    return executarEmTransacao(async (transacao) => {
      const revogados = await transacao
        .update(tokensCaptura)
        .set({ revogadoEm: new Date(), revogadoPor: dados.autorUsuarioId })
        .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
        .returning({ id: tokensCaptura.id });

      for (const revogado of revogados) {
        await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaRevogado, revogado.id, {
          motivo: "revogado",
        });
      }
      return revogados.length > 0;
    }, this.banco);
  }

  async resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null> {
    const [linha] = await this.banco
      .select({
        tokenId: tokensCaptura.id,
        limiteEnviosHora: tokensCaptura.limiteEnviosHora,
        empresaId: empresas.id,
        organizacaoId: empresas.organizacaoId,
        nomeEmpresa: empresas.nome,
        nomeFantasia: empresas.nomeFantasia,
      })
      .from(tokensCaptura)
      .innerJoin(empresas, eq(empresas.id, tokensCaptura.empresaId))
      .where(and(eq(tokensCaptura.tokenHash, tokenHash), isNull(tokensCaptura.revogadoEm)))
      .limit(1);
    if (!linha) return null;
    return {
      escopo: {
        organizacaoId: comoIdentificador<"Organizacao">(linha.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(linha.empresaId),
      },
      tokenId: linha.tokenId,
      limiteEnviosHora: linha.limiteEnviosHora,
      nomeEmpresa: linha.nomeFantasia ?? linha.nomeEmpresa,
    };
  }

  async procurarArquivoPorImpressao(escopo: EscopoEmpresa, impressaoDigital: string): Promise<{ readonly id: string } | null> {
    const [linha] = await this.banco
      .select({ id: arquivos.id })
      .from(arquivos)
      .where(and(eq(arquivos.empresaId, escopo.empresaId), eq(arquivos.impressaoDigital, impressaoDigital), isNull(arquivos.removidoEm)))
      .limit(1);
    return linha ?? null;
  }

  async receberDocumento(escopo: EscopoEmpresa, dados: DadosDoEnvio): Promise<{ readonly id: string; readonly codigo: string }> {
    return executarEmTransacao(async (transacao) => {
      // Dentro da transacao: o numero so e consumido se o documento for gravado.
      const codigo = await new GeradorCodigoPostgres(transacao).gerarProximo(
        escopo.empresaId,
        PREFIXOS_CODIGO.documentoCapturado,
        dados.ano,
      );

      const [documento] = await transacao
        .insert(documentosCapturados)
        .values({ empresaId: escopo.empresaId, tokenId: dados.tokenId, codigo, observacao: dados.observacao, chaveAcesso: dados.chaveAcesso })
        .returning({ id: documentosCapturados.id });

      let ordem = 0;
      for (const arquivo of dados.arquivos) {
        let arquivoId: string;
        if ("existenteId" in arquivo) {
          arquivoId = arquivo.existenteId;
        } else {
          const [criado] = await transacao
            .insert(arquivos)
            .values({ empresaId: escopo.empresaId, enviadoPorUsuarioId: null, ...arquivo.novo })
            .returning({ id: arquivos.id });
          arquivoId = criado!.id;
        }
        await transacao.insert(anexosDocumentosCapturados).values({ documentoId: documento!.id, arquivoId, ordem });
        ordem += 1;
      }

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: ACOES_AUDITORIA.documentoRecebido,
        entidade: "documento_capturado",
        entidadeId: documento!.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        origem: "captura_publica",
        dadosDepois: { codigo, tokenId: dados.tokenId, arquivos: dados.arquivos.length },
        ...(dados.remetente.ipAnonimo ? { ip: dados.remetente.ipAnonimo } : {}),
        ...(dados.remetente.agenteUsuario ? { agenteUsuario: dados.remetente.agenteUsuario.slice(0, 300) } : {}),
      });

      return { id: documento!.id, codigo };
    }, this.banco);
  }

  async contarPendentes(escopo: EscopoEmpresa): Promise<number> {
    const [linha] = await this.banco
      .select({ total: count() })
      .from(documentosCapturados)
      .where(and(eq(documentosCapturados.empresaId, escopo.empresaId), eq(documentosCapturados.situacao, "pendente_conferencia")));
    return linha?.total ?? 0;
  }

  async definirLimiteDeEnvios(escopo: EscopoEmpresa, dados: { readonly limite: number; readonly autorUsuarioId: string }): Promise<boolean> {
    return executarEmTransacao(async (transacao) => {
      const alterados = await transacao
        .update(tokensCaptura)
        .set({ limiteEnviosHora: dados.limite })
        .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
        .returning({ id: tokensCaptura.id });
      const [token] = alterados;
      if (!token) return false;
      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: ACOES_AUDITORIA.configuracaoAlterada,
        entidade: "token_captura",
        entidadeId: token.id,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(dados.autorUsuarioId),
        origem: "interface",
        dadosDepois: { limiteEnviosHora: dados.limite },
      });
      return true;
    }, this.banco);
  }

  async registrarTentativa(identificador: string, janela: Date): Promise<number> {
    const [linha] = await this.banco
      .insert(tentativasCaptura)
      .values({ identificador, janelaIniciadaEm: janela, contador: 1 })
      .onConflictDoUpdate({
        target: [tentativasCaptura.identificador, tentativasCaptura.janelaIniciadaEm],
        set: { contador: sql`${tentativasCaptura.contador} + 1` },
      })
      .returning({ contador: tentativasCaptura.contador });
    return linha?.contador ?? 1;
  }

  async listarDocumentos(escopo: EscopoEmpresa, filtro: FiltroDaFila): Promise<{ readonly itens: readonly DocumentoNaFila[]; readonly total: number }> {
    const condicao = and(
      eq(documentosCapturados.empresaId, escopo.empresaId),
      ...(filtro.situacao ? [eq(documentosCapturados.situacao, filtro.situacao)] : []),
    );
    const [linhas, [contagem]] = await Promise.all([
      this.banco
        .select({
          id: documentosCapturados.id,
          codigo: documentosCapturados.codigo,
          situacao: documentosCapturados.situacao,
          observacao: documentosCapturados.observacao,
          chaveAcesso: documentosCapturados.chaveAcesso,
          entrouNaFilaEm: documentosCapturados.entrouNaFilaEm,
          criadoEm: documentosCapturados.criadoEm,
          /*
           * Referencia LITERAL a tabela externa: com `${documentosCapturados.id}`
           * o Drizzle nao correlacionava a subconsulta e todo documento vinha
           * com 0 anexos (descoberto pelo teste de isolamento). Nao ha valor
           * de fora aqui — e nome de tabela e coluna do proprio esquema.
           */
          quantidadeAnexos: sql<number>`(SELECT count(*)::int FROM anexos_documentos_capturados a WHERE a.documento_id = documentos_capturados.id)`,
        })
        .from(documentosCapturados)
        .where(condicao)
        // Fila: o mais antigo primeiro — e ele que esta esperando ha mais tempo.
        .orderBy(filtro.situacao === "pendente_conferencia" || !filtro.situacao ? documentosCapturados.entrouNaFilaEm : desc(documentosCapturados.criadoEm))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.banco.select({ total: count() }).from(documentosCapturados).where(condicao),
    ]);
    return { itens: linhas, total: contagem?.total ?? 0 };
  }

  async contarPendentesAntigos(escopo: EscopoEmpresa, antesDe: Date): Promise<number> {
    const [linha] = await this.banco
      .select({ total: count() })
      .from(documentosCapturados)
      .where(
        and(
          eq(documentosCapturados.empresaId, escopo.empresaId),
          eq(documentosCapturados.situacao, "pendente_conferencia"),
          lt(documentosCapturados.entrouNaFilaEm, antesDe),
        ),
      );
    return linha?.total ?? 0;
  }

  async obterDocumento(escopo: EscopoEmpresa, documentoId: string): Promise<DocumentoDetalhado | null> {
    const [documento] = await this.banco
      .select()
      .from(documentosCapturados)
      .where(and(eq(documentosCapturados.id, documentoId), eq(documentosCapturados.empresaId, escopo.empresaId)))
      .limit(1);
    if (!documento) return null;

    const anexos: AnexoDoDocumento[] = (
      await this.banco
        .select({
          arquivoId: arquivos.id,
          nomeOriginal: arquivos.nomeOriginal,
          tipoConteudo: arquivos.tipoConteudo,
          tamanhoBytes: arquivos.tamanhoBytes,
          ordem: anexosDocumentosCapturados.ordem,
          removidoEm: arquivos.removidoEm,
        })
        .from(anexosDocumentosCapturados)
        .innerJoin(arquivos, eq(arquivos.id, anexosDocumentosCapturados.arquivoId))
        .where(eq(anexosDocumentosCapturados.documentoId, documento.id))
        .orderBy(anexosDocumentosCapturados.ordem)
    ).map(({ removidoEm, ...anexo }) => ({ ...anexo, removido: removidoEm !== null }));

    return {
      id: documento.id,
      codigo: documento.codigo,
      situacao: documento.situacao,
      observacao: documento.observacao,
      chaveAcesso: documento.chaveAcesso,
      entrouNaFilaEm: documento.entrouNaFilaEm,
      criadoEm: documento.criadoEm,
      quantidadeAnexos: anexos.length,
      dataCompetencia: documento.dataCompetencia as DocumentoDetalhado["dataCompetencia"],
      dataMarcoRetencao: documento.dataMarcoRetencao as DocumentoDetalhado["dataMarcoRetencao"],
      tituloPagarId: documento.tituloPagarId,
      conferidoEm: documento.conferidoEm,
      conferidoPor: documento.conferidoPor,
      motivoRejeicao: documento.motivoRejeicao,
      arquivadoEm: documento.arquivadoEm,
      reabertoEm: documento.reabertoEm,
      anexos,
    };
  }

  async obterAnexo(escopo: EscopoEmpresa, documentoId: string, arquivoId: string) {
    const [linha] = await this.banco
      .select({ chaveArmazenamento: arquivos.chaveArmazenamento, tipoConteudo: arquivos.tipoConteudo, nomeOriginal: arquivos.nomeOriginal })
      .from(anexosDocumentosCapturados)
      .innerJoin(documentosCapturados, eq(documentosCapturados.id, anexosDocumentosCapturados.documentoId))
      .innerJoin(arquivos, eq(arquivos.id, anexosDocumentosCapturados.arquivoId))
      .where(
        and(
          eq(anexosDocumentosCapturados.documentoId, documentoId),
          eq(anexosDocumentosCapturados.arquivoId, arquivoId),
          eq(documentosCapturados.empresaId, escopo.empresaId),
          eq(arquivos.empresaId, escopo.empresaId),
          isNull(arquivos.removidoEm),
        ),
      )
      .limit(1);
    return linha ?? null;
  }

  async procurarOutroComChave(escopo: EscopoEmpresa, chaveAcesso: string, excetoDocumentoId: string) {
    const [linha] = await this.banco
      .select({ id: documentosCapturados.id, codigo: documentosCapturados.codigo })
      .from(documentosCapturados)
      .where(
        and(
          eq(documentosCapturados.empresaId, escopo.empresaId),
          eq(documentosCapturados.chaveAcesso, chaveAcesso),
          ne(documentosCapturados.id, excetoDocumentoId),
        ),
      )
      .orderBy(documentosCapturados.criadoEm)
      .limit(1);
    return linha ?? null;
  }

  /**
   * Aprovacao ATOMICA: a conta a pagar nasce pelo `publico.ts` de contas a
   * pagar, dentro DESTA transacao — o repositorio de la aceita uma transacao
   * pelo construtor (`ExecutorBancoDados`), e o `executarEmTransacao` interno
   * dele vira um savepoint. Se a marcacao do documento falhar depois, a conta
   * some junto. A linha do documento e travada antes, para duas aprovacoes
   * simultaneas nao criarem duas contas.
   */
  async aprovar(escopo: EscopoEmpresa, documentoId: string, dados: DadosDeAprovacao): Promise<{ readonly tituloId: string; readonly parcelaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const documento = await this.travarDocumento(transacao, escopo, documentoId);
      if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);

      const conta = await new RepositorioContasPagarDrizzle(transacao).criar(escopo, dados.conta, dados.autorUsuarioId);

      const agora = new Date();
      await transacao
        .update(documentosCapturados)
        .set({
          situacao: "aprovado",
          conferidoEm: agora,
          conferidoPor: dados.autorUsuarioId,
          tituloPagarId: conta.tituloId,
          dataCompetencia: dados.dataCompetencia,
          chaveAcesso: dados.chaveAcesso,
          dataMarcoRetencao: dados.dataMarcoRetencao,
          atualizadoEm: agora,
        })
        .where(eq(documentosCapturados.id, documentoId));

      await this.registrarConferencia(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.documentoConferido, documentoId, {
        decisao: "aprovado",
        codigo: documento.codigo,
        tituloPagarId: conta.tituloId,
        dataMarcoRetencao: dados.dataMarcoRetencao,
      });
      return conta;
    }, this.banco);
  }

  async rejeitar(
    escopo: EscopoEmpresa,
    documentoId: string,
    dados: { readonly motivo: string; readonly dataMarcoRetencao: DataCivil; readonly autorUsuarioId: string },
  ): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const documento = await this.travarDocumento(transacao, escopo, documentoId);
      if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);
      const agora = new Date();
      await transacao
        .update(documentosCapturados)
        .set({
          situacao: "rejeitado",
          conferidoEm: agora,
          conferidoPor: dados.autorUsuarioId,
          motivoRejeicao: dados.motivo,
          dataMarcoRetencao: dados.dataMarcoRetencao,
          atualizadoEm: agora,
        })
        .where(eq(documentosCapturados.id, documentoId));
      await this.registrarConferencia(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.documentoConferido, documentoId, {
        decisao: "rejeitado",
        codigo: documento.codigo,
        motivo: dados.motivo,
        dataMarcoRetencao: dados.dataMarcoRetencao,
      });
    }, this.banco);
  }

  async reabrir(escopo: EscopoEmpresa, documentoId: string, dados: { readonly autorUsuarioId: string }): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const documento = await this.travarDocumento(transacao, escopo, documentoId);
      if (!podeReabrir(documento.situacao)) throw new DocumentoNaoReabrivel(documento.situacao);
      const agora = new Date();
      await transacao
        .update(documentosCapturados)
        .set({
          situacao: "pendente_conferencia",
          // Reabrir reinicia a contagem de abandono e apaga o juizo anterior; o marco de retencao volta a ser decidido na proxima conferencia.
          entrouNaFilaEm: agora,
          reabertoEm: agora,
          reabertoPor: dados.autorUsuarioId,
          conferidoEm: null,
          conferidoPor: null,
          motivoRejeicao: null,
          arquivadoEm: null,
          dataMarcoRetencao: null,
          atualizadoEm: agora,
        })
        .where(eq(documentosCapturados.id, documentoId));
      await this.registrarConferencia(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.documentoReaberto, documentoId, {
        codigo: documento.codigo,
        situacaoAnterior: documento.situacao,
      });
    }, this.banco);
  }

  async listarEscoposComDocumentos(): Promise<readonly EscopoEmpresa[]> {
    const linhas = await this.banco
      .selectDistinct({ empresaId: empresas.id, organizacaoId: empresas.organizacaoId })
      .from(documentosCapturados)
      .innerJoin(empresas, eq(empresas.id, documentosCapturados.empresaId));
    return linhas.map((linha) => ({
      organizacaoId: comoIdentificador<"Organizacao">(linha.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(linha.empresaId),
    }));
  }

  async arquivarAbandonados(escopo: EscopoEmpresa, limite: Date, marcoDe: (dataDoEnvio: DataCivil) => DataCivil): Promise<readonly string[]> {
    return executarEmTransacao(async (transacao) => {
      const abandonados = await transacao
        .select({ id: documentosCapturados.id, codigo: documentosCapturados.codigo, criadoEm: documentosCapturados.criadoEm })
        .from(documentosCapturados)
        .where(
          and(
            eq(documentosCapturados.empresaId, escopo.empresaId),
            eq(documentosCapturados.situacao, "pendente_conferencia"),
            lt(documentosCapturados.entrouNaFilaEm, limite),
          ),
        )
        .for("update");
      const agora = new Date();
      for (const documento of abandonados) {
        await transacao
          .update(documentosCapturados)
          .set({
            situacao: "arquivado_sem_conferencia",
            arquivadoEm: agora,
            dataMarcoRetencao: marcoDe(dataCivilDoInstante(documento.criadoEm)),
            atualizadoEm: agora,
          })
          .where(eq(documentosCapturados.id, documento.id));
        await new RegistradorAuditoriaDrizzle(transacao).registrar({
          acao: ACOES_AUDITORIA.documentoArquivado,
          entidade: "documento_capturado",
          entidadeId: documento.id,
          organizacaoId: escopo.organizacaoId,
          empresaId: escopo.empresaId,
          origem: "tarefa",
          dadosDepois: { codigo: documento.codigo, motivo: "abandono", diasNaFila: ABANDONO_DIAS },
        });
      }
      return abandonados.map((d) => d.codigo);
    }, this.banco);
  }

  async expurgarVencidos(escopo: EscopoEmpresa, hoje: DataCivil): Promise<{ readonly documentos: readonly string[]; readonly chavesParaRemover: readonly string[] }> {
    return executarEmTransacao(async (transacao) => {
      const vencidos = await transacao
        .select({ id: documentosCapturados.id, codigo: documentosCapturados.codigo })
        .from(documentosCapturados)
        .where(
          and(
            eq(documentosCapturados.empresaId, escopo.empresaId),
            isNull(documentosCapturados.expurgadoEm),
            isNotNull(documentosCapturados.dataMarcoRetencao),
            lte(documentosCapturados.dataMarcoRetencao, hoje),
            ne(documentosCapturados.situacao, "pendente_conferencia"),
          ),
        )
        .for("update");
      if (vencidos.length === 0) return { documentos: [], chavesParaRemover: [] };

      const agora = new Date();
      const idsVencidos = vencidos.map((d) => d.id);
      await transacao
        .update(documentosCapturados)
        .set({ expurgadoEm: agora, atualizadoEm: agora })
        .where(inArray(documentosCapturados.id, idsVencidos));

      /*
       * Arquivos dos documentos vencidos que NENHUMA outra linha viva
       * referencia: nem outro documento capturado ainda vigente, nem qualquer
       * tabela `anexos_*` do resto do sistema. Conteudo e compartilhado por
       * hash; apagar por documento apagaria a nota de outro.
       */
      const candidatos = await transacao
        .select({ arquivoId: arquivos.id, chave: arquivos.chaveArmazenamento })
        .from(anexosDocumentosCapturados)
        .innerJoin(arquivos, eq(arquivos.id, anexosDocumentosCapturados.arquivoId))
        .where(and(inArray(anexosDocumentosCapturados.documentoId, idsVencidos), isNull(arquivos.removidoEm), eq(arquivos.empresaId, escopo.empresaId)));

      const chavesParaRemover: string[] = [];
      for (const candidato of [...new Map(candidatos.map((c) => [c.arquivoId, c])).values()]) {
        const [referencias] = await transacao.execute<{ vivas: number }>(sql`
          SELECT (
            (SELECT count(*) FROM anexos_documentos_capturados a JOIN documentos_capturados d ON d.id = a.documento_id
              WHERE a.arquivo_id = ${candidato.arquivoId} AND d.expurgado_em IS NULL)
            + (SELECT count(*) FROM anexos_titulos_pagar WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM anexos_titulos_receber WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM anexos_pagamentos WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM anexos_recebimentos WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM anexos_pessoas WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM anexos_dividas WHERE arquivo_id = ${candidato.arquivoId})
            + (SELECT count(*) FROM extratos_bancarios WHERE arquivo_id = ${candidato.arquivoId})
          )::int AS vivas
        `);
        if ((referencias?.vivas ?? 1) > 0) continue;
        await transacao.update(arquivos).set({ removidoEm: agora, atualizadoEm: agora }).where(eq(arquivos.id, candidato.arquivoId));
        chavesParaRemover.push(candidato.chave);
        await new RegistradorAuditoriaDrizzle(transacao).registrar({
          acao: ACOES_AUDITORIA.arquivoExpurgado,
          entidade: "arquivo",
          entidadeId: candidato.arquivoId,
          organizacaoId: escopo.organizacaoId,
          empresaId: escopo.empresaId,
          origem: "tarefa",
          dadosDepois: { motivo: "fim_da_retencao" },
        });
      }
      return { documentos: vencidos.map((d) => d.codigo), chavesParaRemover };
    }, this.banco);
  }

  async limparTentativas(antesDe: Date): Promise<number> {
    const apagadas = await this.banco
      .delete(tentativasCaptura)
      .where(lt(tentativasCaptura.janelaIniciadaEm, antesDe))
      .returning({ identificador: tentativasCaptura.identificador });
    return apagadas.length;
  }

  /** `SELECT ... FOR UPDATE` filtrado pela empresa: duas conferencias simultaneas do mesmo documento se enfileiram. */
  private async travarDocumento(executor: ExecutorBancoDados, escopo: EscopoEmpresa, documentoId: string) {
    const [documento] = await executor
      .select({ id: documentosCapturados.id, codigo: documentosCapturados.codigo, situacao: documentosCapturados.situacao })
      .from(documentosCapturados)
      .where(and(eq(documentosCapturados.id, documentoId), eq(documentosCapturados.empresaId, escopo.empresaId)))
      .for("update");
    if (!documento) throw new DocumentoNaoEncontrado();
    return documento;
  }

  private async registrarConferencia(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    usuarioId: string,
    acao: string,
    documentoId: string,
    dadosDepois: Record<string, unknown>,
  ): Promise<void> {
    await new RegistradorAuditoriaDrizzle(executor).registrar({
      acao,
      entidade: "documento_capturado",
      entidadeId: documentoId,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(usuarioId),
      origem: "interface",
      dadosDepois,
    });
  }

  /** O hash nunca vai para a trilha: so o id do token. */
  private async registrar(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    usuarioId: string,
    acao: string,
    tokenId: string,
    dadosDepois: Record<string, unknown>,
  ): Promise<void> {
    await new RegistradorAuditoriaDrizzle(executor).registrar({
      acao,
      entidade: "token_captura",
      entidadeId: tokenId,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(usuarioId),
      origem: "interface",
      dadosDepois,
    });
  }
}
