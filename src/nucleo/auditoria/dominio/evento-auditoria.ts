import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";

/**
 * De onde veio a acao auditada.
 *
 * `captura_publica` e o envio de documento pela pagina do QR code: nao ha
 * sessao nem usuario, so o token da empresa. Nenhum dos outros valores
 * descreveria isso com honestidade. A coluna no banco e texto, sem enum, entao
 * acrescentar um valor aqui nao pede migracao.
 */
export type OrigemAcao = "interface" | "importacao" | "api" | "tarefa" | "sistema" | "captura_publica";

/**
 * Evento de auditoria: quem fez o que, quando, com o que mudou.
 *
 * `dadosAntes` e `dadosDepois` guardam apenas os campos relevantes da
 * entidade (nunca senhas, tokens ou dados bancarios sigilosos). Quem monta o
 * evento e o caso de uso; a auditoria nao adivinha o que registrar.
 */
export interface EventoAuditoria {
  readonly acao: string;
  readonly entidade: string;
  readonly entidadeId?: string;
  readonly organizacaoId?: IdOrganizacao;
  readonly empresaId?: IdEmpresa;
  readonly usuarioId?: IdUsuario;
  readonly origem: OrigemAcao;
  readonly dadosAntes?: Record<string, unknown>;
  readonly dadosDepois?: Record<string, unknown>;
  readonly ip?: string;
  readonly agenteUsuario?: string;
  readonly requisicaoId?: string;
}

/**
 * Acoes auditadas conhecidas. Modulos adicionam as suas aqui para manter um
 * vocabulario unico ("<entidade>.<verbo no participio>").
 */
export const ACOES_AUDITORIA = {
  contaPagarCriada: "conta_pagar.criada",
  contaPagarAlterada: "conta_pagar.alterada",
  contaPagarAprovada: "conta_pagar.aprovada",
  contaPagarPaga: "conta_pagar.paga",
  contaPagarCancelada: "conta_pagar.cancelada",
  contaPagarExcluida: "conta_pagar.excluida",
  contaReceberCriada: "conta_receber.criada",
  contaReceberAlterada: "conta_receber.alterada",
  contaReceberBaixada: "conta_receber.baixada",
  contaReceberCancelada: "conta_receber.cancelada",
  conciliacaoRealizada: "conciliacao.realizada",
  conciliacaoDesfeita: "conciliacao.desfeita",
  extratoImportado: "extrato.importado",
  importacaoRevertida: "importacao.revertida",
  empresaInstalada: "empresa.instalada",
  usuarioConvidado: "usuario.convidado",
  usuarioPermissaoAlterada: "usuario.permissao_alterada",
  usuarioVinculoRevogado: "usuario.vinculo_revogado",
  configuracaoAlterada: "configuracao.alterada",
  registroRestaurado: "registro.restaurado",
  // Captura de documentos por QR code (Gate 10)
  qrCapturaGerado: "qr_captura.gerado",
  qrCapturaRevogado: "qr_captura.revogado",
  documentoRecebido: "documento.recebido",
  documentoConferido: "documento.conferido",
  /** Arquivado por abandono (tarefa), nao por juizo de alguem: a trilha distingue os dois. */
  documentoArquivado: "documento.arquivado",
  documentoReaberto: "documento.reaberto",
  /** Conteudo removido no fim da retencao; a linha e a trilha permanecem. */
  arquivoExpurgado: "arquivo.expurgado",
} as const;

export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[keyof typeof ACOES_AUDITORIA];
