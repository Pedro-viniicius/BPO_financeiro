import type { DataCivil } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import { DocumentoNaoEncontrado, DocumentoNaoPendente, DocumentoNaoReabrivel, podeReabrir } from "../../dominio/conferencia";
import { hashDoTokenDeCaptura } from "../../dominio/token-captura";
import type {
  DadosDeAprovacao, DadosDoEnvio, DocumentoDetalhado, EscopoResolvidoPorToken, FiltroDaFila, RepositorioCaptura, TokenDeCapturaAtivo,
} from "../repositorio-captura";

export const escopoDeTeste: EscopoEmpresa = {
  organizacaoId: comoIdentificador<"Organizacao">("org-1"),
  empresaId: comoIdentificador<"Empresa">("emp-1"),
};

/**
 * Repositorio em memoria para os testes de CASO DE USO. Guarda o que
 * recebeu, para os testes conferirem o que chegou (so o hash do token, o IP
 * ja anonimizado, a conta montada...). O isolamento entre empresas e provado
 * contra PostgreSQL real, nao aqui.
 */
export class RepositorioCapturaEmMemoria implements RepositorioCaptura {
  ativo: (TokenDeCapturaAtivo & { hash: string }) | null = null;
  hashesRecebidos: string[] = [];
  tokenValido: string | null = null;
  limite = 20;
  readonly impressoesConhecidas = new Map<string, string>();
  readonly tentativas = new Map<string, number>();
  recebidos: DadosDoEnvio[] = [];
  documentos = new Map<string, DocumentoDetalhado>();
  aprovacoes: { documentoId: string; dados: DadosDeAprovacao }[] = [];
  rejeicoes: { documentoId: string; motivo: string; dataMarcoRetencao: DataCivil }[] = [];
  reaberturas: string[] = [];

  constructor(tokenValido?: string) {
    if (tokenValido) this.tokenValido = hashDoTokenDeCaptura(tokenValido);
  }

  async obterTokenAtivo(): Promise<TokenDeCapturaAtivo | null> {
    return this.ativo;
  }
  async gerarToken(_escopo: EscopoEmpresa, dados: { tokenHash: string; autorUsuarioId: string }) {
    this.hashesRecebidos.push(dados.tokenHash);
    const substituiuAnterior = this.ativo !== null;
    this.ativo = { id: `t${this.hashesRecebidos.length}`, criadoEm: new Date(), criadoPor: dados.autorUsuarioId, limiteEnviosHora: this.limite, hash: dados.tokenHash };
    return { id: this.ativo.id, substituiuAnterior };
  }
  async revogarToken(): Promise<boolean> {
    const havia = this.ativo !== null;
    this.ativo = null;
    return havia;
  }
  async resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null> {
    if (this.tokenValido && tokenHash === this.tokenValido) {
      return { escopo: escopoDeTeste, tokenId: "tok-1", limiteEnviosHora: this.limite, nomeEmpresa: "Nova Didata" };
    }
    if (this.ativo && this.ativo.hash === tokenHash) {
      return { escopo: escopoDeTeste, tokenId: this.ativo.id, limiteEnviosHora: this.ativo.limiteEnviosHora, nomeEmpresa: "Empresa" };
    }
    return null;
  }
  async procurarArquivoPorImpressao(_e: EscopoEmpresa, impressao: string) {
    const id = this.impressoesConhecidas.get(impressao);
    return id ? { id } : null;
  }
  async receberDocumento(_e: EscopoEmpresa, dados: DadosDoEnvio) {
    this.recebidos.push(dados);
    return { id: `doc-${this.recebidos.length}`, codigo: `DC-2026-${String(this.recebidos.length).padStart(6, "0")}` };
  }
  async contarPendentes() {
    return [...this.documentos.values()].filter((d) => d.situacao === "pendente_conferencia").length;
  }
  async definirLimiteDeEnvios(_e: EscopoEmpresa, dados: { limite: number }) {
    if (!this.ativo) return false;
    this.ativo = { ...this.ativo, limiteEnviosHora: dados.limite };
    return true;
  }
  async registrarTentativa(identificador: string, janela: Date) {
    const chave = `${identificador}@${janela.toISOString()}`;
    const total = (this.tentativas.get(chave) ?? 0) + 1;
    this.tentativas.set(chave, total);
    return total;
  }
  async listarDocumentos(_e: EscopoEmpresa, filtro: FiltroDaFila) {
    const itens = [...this.documentos.values()].filter((d) => !filtro.situacao || d.situacao === filtro.situacao);
    return { itens, total: itens.length };
  }
  async contarPendentesAntigos(_e: EscopoEmpresa, antesDe: Date) {
    return [...this.documentos.values()].filter((d) => d.situacao === "pendente_conferencia" && d.entrouNaFilaEm < antesDe).length;
  }
  async obterDocumento(_e: EscopoEmpresa, id: string) {
    return this.documentos.get(id) ?? null;
  }
  async obterAnexo() {
    return null;
  }
  async procurarOutroComChave(_e: EscopoEmpresa, chave: string, exceto: string) {
    const outro = [...this.documentos.values()].find((d) => d.chaveAcesso === chave && d.id !== exceto);
    return outro ? { id: outro.id, codigo: outro.codigo } : null;
  }
  async aprovar(_e: EscopoEmpresa, documentoId: string, dados: DadosDeAprovacao) {
    const documento = this.documentos.get(documentoId);
    if (!documento) throw new DocumentoNaoEncontrado();
    if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);
    this.aprovacoes.push({ documentoId, dados });
    this.documentos.set(documentoId, { ...documento, situacao: "aprovado", tituloPagarId: "titulo-1", dataMarcoRetencao: dados.dataMarcoRetencao, conferidoEm: new Date(), conferidoPor: dados.autorUsuarioId });
    return { tituloId: "titulo-1", parcelaId: "parcela-1" };
  }
  async rejeitar(_e: EscopoEmpresa, documentoId: string, dados: { motivo: string; dataMarcoRetencao: DataCivil; autorUsuarioId: string }) {
    const documento = this.documentos.get(documentoId);
    if (!documento) throw new DocumentoNaoEncontrado();
    if (documento.situacao !== "pendente_conferencia") throw new DocumentoNaoPendente(documento.situacao);
    this.rejeicoes.push({ documentoId, motivo: dados.motivo, dataMarcoRetencao: dados.dataMarcoRetencao });
    this.documentos.set(documentoId, { ...documento, situacao: "rejeitado", motivoRejeicao: dados.motivo, dataMarcoRetencao: dados.dataMarcoRetencao, conferidoEm: new Date(), conferidoPor: dados.autorUsuarioId });
  }
  async reabrir(_e: EscopoEmpresa, documentoId: string) {
    const documento = this.documentos.get(documentoId);
    if (!documento) throw new DocumentoNaoEncontrado();
    if (!podeReabrir(documento.situacao)) throw new DocumentoNaoReabrivel(documento.situacao);
    this.reaberturas.push(documentoId);
    this.documentos.set(documentoId, { ...documento, situacao: "pendente_conferencia", motivoRejeicao: null, dataMarcoRetencao: null, entrouNaFilaEm: new Date(), reabertoEm: new Date() });
  }
}

export function documentoPendente(id: string, extras: Partial<DocumentoDetalhado> = {}): DocumentoDetalhado {
  return {
    id,
    codigo: `DC-2026-${id.padStart(6, "0")}`,
    situacao: "pendente_conferencia",
    observacao: null,
    chaveAcesso: null,
    entrouNaFilaEm: new Date("2026-09-24T12:00:00Z"),
    criadoEm: new Date("2026-09-24T12:00:00Z"),
    quantidadeAnexos: 1,
    dataCompetencia: null,
    dataMarcoRetencao: null,
    tituloPagarId: null,
    conferidoEm: null,
    conferidoPor: null,
    motivoRejeicao: null,
    arquivadoEm: null,
    reabertoEm: null,
    anexos: [{ arquivoId: "arq-1", nomeOriginal: "nota.jpg", tipoConteudo: "image/jpeg", tamanhoBytes: 1000, ordem: 0, removido: false }],
    ...extras,
  };
}
