import type { DataCivil } from "@/compartilhado/datas/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { DadosNovaContaPagar } from "@/modulos/contas-pagar/publico";

import type { SituacaoDocumento } from "../dominio/conferencia";

/** O token ativo de uma empresa, como a tela de configuracao o ve. Nunca inclui o hash. */
export interface TokenDeCapturaAtivo {
  readonly id: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly limiteEnviosHora: number;
}

/** O que a pagina publica recebe ao trocar um token valido por um escopo. */
export interface EscopoResolvidoPorToken {
  readonly escopo: EscopoEmpresa;
  readonly tokenId: string;
  readonly limiteEnviosHora: number;
  readonly nomeEmpresa: string;
}

/**
 * Contrato do repositorio de captura.
 *
 * Todo metodo recebe `EscopoEmpresa` primeiro (ADR-017) — menos UM:
 * `resolverEscopoPorToken`. Ele e a excecao que a ADR-033 descreve: na
 * pagina publica nao ha sessao, e este e o unico lugar do sistema que
 * FABRICA um escopo a partir de um token. Abaixo dele, nenhuma linha sabe
 * que houve token; acima dele, ninguem monta escopo por conta propria.
 */
/** Arquivo ja guardado no armazenamento, pronto para virar linha em `arquivos`. */
export interface NovoArquivo {
  readonly chaveArmazenamento: string;
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly impressaoDigital: string;
}

/**
 * Um anexo do envio: ou um arquivo NOVO, ou um que a empresa ja tinha com o
 * mesmo conteudo (mesmo SHA-256). Reenviar a mesma foto nao duplica nada.
 */
export type ArquivoDoEnvio = { readonly existenteId: string } | { readonly novo: NovoArquivo };

export interface DadosDoEnvio {
  readonly tokenId: string;
  readonly ano: number;
  readonly observacao: string | null;
  readonly arquivos: readonly ArquivoDoEnvio[];
  /** Para a trilha (LGPD): IP ja anonimizado por HMAC, nunca em claro. */
  readonly remetente: { readonly ipAnonimo: string | null; readonly agenteUsuario: string | null };
}

export interface DocumentoNaFila {
  readonly id: string;
  readonly codigo: string;
  readonly situacao: SituacaoDocumento;
  readonly observacao: string | null;
  readonly chaveAcesso: string | null;
  readonly entrouNaFilaEm: Date;
  readonly criadoEm: Date;
  readonly quantidadeAnexos: number;
}

export interface AnexoDoDocumento {
  readonly arquivoId: string;
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly ordem: number;
  /** Conteudo ja expurgado pela retencao: a linha fica, o arquivo nao. */
  readonly removido: boolean;
}

export interface DocumentoDetalhado extends DocumentoNaFila {
  readonly dataCompetencia: DataCivil | null;
  readonly dataMarcoRetencao: DataCivil | null;
  readonly tituloPagarId: string | null;
  readonly conferidoEm: Date | null;
  readonly conferidoPor: string | null;
  readonly motivoRejeicao: string | null;
  readonly arquivadoEm: Date | null;
  readonly reabertoEm: Date | null;
  readonly anexos: readonly AnexoDoDocumento[];
}

export interface FiltroDaFila {
  readonly situacao?: SituacaoDocumento;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface DadosDeAprovacao {
  /** A conta que nasce. Uma parcela, no mesmo estado inicial de uma lancada a mao. */
  readonly conta: DadosNovaContaPagar;
  readonly dataCompetencia: DataCivil;
  readonly chaveAcesso: string | null;
  readonly dataMarcoRetencao: DataCivil;
  readonly autorUsuarioId: string;
}

export interface RepositorioCaptura {
  listarDocumentos(escopo: EscopoEmpresa, filtro: FiltroDaFila): Promise<{ readonly itens: readonly DocumentoNaFila[]; readonly total: number }>;
  /** Pendentes que entraram na fila antes de `antesDe`: o contador de "ha mais de 30 dias". */
  contarPendentesAntigos(escopo: EscopoEmpresa, antesDe: Date): Promise<number>;
  obterDocumento(escopo: EscopoEmpresa, documentoId: string): Promise<DocumentoDetalhado | null>;
  /** So devolve o anexo se ele pertencer a um documento DESTA empresa. */
  obterAnexo(
    escopo: EscopoEmpresa,
    documentoId: string,
    arquivoId: string,
  ): Promise<{ readonly chaveArmazenamento: string; readonly tipoConteudo: string; readonly nomeOriginal: string } | null>;
  /** Outro documento da MESMA empresa com esta chave (aviso de duplicidade, nunca entre empresas — ADR-017). */
  procurarOutroComChave(escopo: EscopoEmpresa, chaveAcesso: string, excetoDocumentoId: string): Promise<{ readonly id: string; readonly codigo: string } | null>;
  /**
   * Aprova: cria a conta a pagar pelo `publico.ts` de contas a pagar e marca o
   * documento, NA MESMA TRANSACAO. Se qualquer passo falhar, nem a conta nem a
   * marcacao existem.
   */
  aprovar(escopo: EscopoEmpresa, documentoId: string, dados: DadosDeAprovacao): Promise<{ readonly tituloId: string; readonly parcelaId: string }>;
  rejeitar(
    escopo: EscopoEmpresa,
    documentoId: string,
    dados: { readonly motivo: string; readonly dataMarcoRetencao: DataCivil; readonly autorUsuarioId: string },
  ): Promise<void>;
  /** Volta um rejeitado ou arquivado para a fila; reinicia a contagem de abandono. */
  reabrir(escopo: EscopoEmpresa, documentoId: string, dados: { readonly autorUsuarioId: string }): Promise<void>;
  obterTokenAtivo(escopo: EscopoEmpresa): Promise<TokenDeCapturaAtivo | null>;
  /** Arquivo desta empresa com este SHA-256, se ainda tiver conteudo. */
  procurarArquivoPorImpressao(escopo: EscopoEmpresa, impressaoDigital: string): Promise<{ readonly id: string } | null>;
  /** Cria o documento pendente, seus anexos e o evento `documento.recebido`, numa transacao. */
  receberDocumento(escopo: EscopoEmpresa, dados: DadosDoEnvio): Promise<{ readonly id: string; readonly codigo: string }>;
  contarPendentes(escopo: EscopoEmpresa): Promise<number>;
  /** Limite de envios por hora do token ativo. Auditado como `configuracao.alterada`. */
  definirLimiteDeEnvios(escopo: EscopoEmpresa, dados: { readonly limite: number; readonly autorUsuarioId: string }): Promise<boolean>;
  /**
   * Conta UMA tentativa para (identificador, janela) e devolve o total da
   * janela, ja com esta. Uma ida ao banco, uma linha (ADR-031). Sem escopo:
   * quem falhou na porta nao tem empresa — ver o cabecalho da migracao 0010.
   */
  registrarTentativa(identificador: string, janela: Date): Promise<number>;
  /** Revoga o token ativo (se houver) e cria o novo, na MESMA transacao: o QR antigo morre no instante em que o novo nasce. */
  gerarToken(
    escopo: EscopoEmpresa,
    dados: { readonly tokenHash: string; readonly autorUsuarioId: string },
  ): Promise<{ readonly id: string; readonly substituiuAnterior: boolean }>;
  /** Verdadeiro se havia token ativo para revogar. */
  revogarToken(escopo: EscopoEmpresa, dados: { readonly autorUsuarioId: string }): Promise<boolean>;
  resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null>;
}
