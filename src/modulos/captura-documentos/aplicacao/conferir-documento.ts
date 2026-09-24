import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { interpretarChaveDeAcesso, type ChaveDeAcesso } from "@/compartilhado/fiscal/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import {
  dataCivilDoInstante, DocumentoNaoEncontrado, DocumentoNaoPendente, DocumentoNaoReabrivel, marcoDeRetencaoAprovado,
  marcoDeRetencaoRejeitado, normalizarMotivo, podeReabrir,
} from "../dominio/conferencia";
import type { DocumentoDetalhado, RepositorioCaptura } from "./repositorio-captura";

export interface DependenciasConferencia {
  readonly repositorio: RepositorioCaptura;
}

export interface EntradaDeAprovacao {
  readonly descricao: string;
  readonly fornecedorId: string;
  readonly categoriaId: string;
  readonly valorTotal: Dinheiro;
  readonly dataVencimento: DataVencimento;
  readonly dataCompetencia: DataCivil;
  readonly chaveAcesso: string | null;
  readonly observacoes?: string;
  /** Datas extraidas do documento (ex.: AAMM da chave, fatia 6). Entram no marco de retencao. */
  readonly datasDoDocumento?: readonly DataCivil[];
}

export interface DocumentoParaConferir extends DocumentoDetalhado {
  /** Outro documento desta empresa com a mesma chave: AVISO para a equipe, nunca bloqueio. */
  readonly duplicadoDe: { readonly id: string; readonly codigo: string } | null;
  /** O que a chave de acesso ja diz por posicao (sem OCR). `null` sem chave ou se ela nao interpreta. */
  readonly dadosDaChave: ChaveDeAcesso | null;
}

export async function abrirDocumento(
  dependencias: DependenciasConferencia,
  escopo: EscopoEmpresa,
  documentoId: string,
): Promise<DocumentoParaConferir> {
  const documento = await dependencias.repositorio.obterDocumento(escopo, documentoId);
  if (!documento) throw new DocumentoNaoEncontrado();
  const duplicadoDe = documento.chaveAcesso
    ? await dependencias.repositorio.procurarOutroComChave(escopo, documento.chaveAcesso, documentoId)
    : null;
  let dadosDaChave: ChaveDeAcesso | null = null;
  if (documento.chaveAcesso) {
    try {
      dadosDaChave = interpretarChaveDeAcesso(documento.chaveAcesso);
    } catch {
      dadosDaChave = null;
    }
  }
  return { ...documento, duplicadoDe, dadosDaChave };
}

/**
 * Aprova: a conta a pagar nasce agora, com UMA parcela, no mesmo estado
 * inicial de uma lancada a mao (`contas_pagar.aprovar` continua sendo etapa
 * separada). O marco de retencao e congelado aqui, a partir da data mais
 * tardia entre o que o documento diz e o dia do envio.
 *
 * Quem chama ja verificou as DUAS permissoes (`captura.conferir` e
 * `contas_pagar.criar`); este caso de uso confere a situacao do documento.
 */
export async function aprovarDocumento(
  dependencias: DependenciasConferencia,
  escopo: EscopoEmpresa,
  documentoId: string,
  entrada: EntradaDeAprovacao,
  autorUsuarioId: string,
): Promise<{ readonly tituloId: string; readonly parcelaId: string }> {
  const documento = await dependencias.repositorio.obterDocumento(escopo, documentoId);
  if (!documento) throw new DocumentoNaoEncontrado();
  if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);

  const dataMarcoRetencao = marcoDeRetencaoAprovado([
    entrada.dataCompetencia,
    dataCivilDoInstante(documento.criadoEm),
    ...(entrada.datasDoDocumento ?? []),
  ]);

  return dependencias.repositorio.aprovar(escopo, documentoId, {
    conta: {
      descricao: entrada.descricao,
      fornecedorId: entrada.fornecedorId,
      categoriaId: entrada.categoriaId,
      dataCompetencia: entrada.dataCompetencia,
      valorTotal: entrada.valorTotal,
      parcelas: [{ numero: 1, dataVencimento: entrada.dataVencimento, valor: entrada.valorTotal }],
      ...(entrada.observacoes ? { observacoes: entrada.observacoes } : {}),
    },
    dataCompetencia: entrada.dataCompetencia,
    chaveAcesso: entrada.chaveAcesso,
    dataMarcoRetencao,
    autorUsuarioId,
  });
}

export async function rejeitarDocumento(
  dependencias: DependenciasConferencia,
  escopo: EscopoEmpresa,
  documentoId: string,
  motivo: string | null | undefined,
  autorUsuarioId: string,
  hoje: DataCivil,
): Promise<void> {
  const motivoLimpo = normalizarMotivo(motivo);
  const documento = await dependencias.repositorio.obterDocumento(escopo, documentoId);
  if (!documento) throw new DocumentoNaoEncontrado();
  if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);
  await dependencias.repositorio.rejeitar(escopo, documentoId, {
    motivo: motivoLimpo,
    dataMarcoRetencao: marcoDeRetencaoRejeitado(hoje),
    autorUsuarioId,
  });
}

/** Visualizar nunca muda estado; reabrir e ACAO explicita, auditada, e reinicia a contagem de abandono. */
export async function reabrirDocumento(
  dependencias: DependenciasConferencia,
  escopo: EscopoEmpresa,
  documentoId: string,
  autorUsuarioId: string,
): Promise<void> {
  const documento = await dependencias.repositorio.obterDocumento(escopo, documentoId);
  if (!documento) throw new DocumentoNaoEncontrado();
  if (!podeReabrir(documento.situacao)) throw new DocumentoNaoReabrivel(documento.situacao);
  await dependencias.repositorio.reabrir(escopo, documentoId, { autorUsuarioId });
}
