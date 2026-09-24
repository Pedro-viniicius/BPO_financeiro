import { describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import { FORMATO_TOKEN_CAPTURA, hashDoTokenDeCaptura } from "../dominio/token-captura";
import { definirLimiteDeEnvios, gerarQrDeCaptura, revogarQrDeCaptura, situacaoDoQr } from "./casos-de-uso-qr";
import type { EscopoResolvidoPorToken, RepositorioCaptura, TokenDeCapturaAtivo } from "./repositorio-captura";

const escopo: EscopoEmpresa = {
  organizacaoId: comoIdentificador<"Organizacao">("org-1"),
  empresaId: comoIdentificador<"Empresa">("emp-1"),
};

/** Repositorio em memoria: guarda o que recebeu, para o teste conferir que so o HASH chegou. */
class RepositorioEmMemoria implements RepositorioCaptura {
  ativo: (TokenDeCapturaAtivo & { hash: string }) | null = null;
  hashesRecebidos: string[] = [];

  async obterTokenAtivo(): Promise<TokenDeCapturaAtivo | null> {
    return this.ativo;
  }
  async gerarToken(_escopo: EscopoEmpresa, dados: { tokenHash: string; autorUsuarioId: string }) {
    this.hashesRecebidos.push(dados.tokenHash);
    const substituiuAnterior = this.ativo !== null;
    this.ativo = { id: `t${this.hashesRecebidos.length}`, criadoEm: new Date(), criadoPor: dados.autorUsuarioId, limiteEnviosHora: 20, hash: dados.tokenHash };
    return { id: this.ativo.id, substituiuAnterior };
  }
  async revogarToken(): Promise<boolean> {
    const havia = this.ativo !== null;
    this.ativo = null;
    return havia;
  }
  async resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null> {
    if (!this.ativo || this.ativo.hash !== tokenHash) return null;
    return { escopo, tokenId: this.ativo.id, limiteEnviosHora: 20, nomeEmpresa: "Empresa" };
  }
  // Fora do assunto deste teste (recebimento de documentos):
  async procurarArquivoPorImpressao() { return null; }
  async receberDocumento(): Promise<{ id: string; codigo: string }> { throw new Error("nao usado aqui"); }
  async contarPendentes() { return 0; }
  async definirLimiteDeEnvios(_e: EscopoEmpresa, dados: { limite: number }) {
    if (!this.ativo) return false;
    this.ativo = { ...this.ativo, limiteEnviosHora: dados.limite };
    return true;
  }
  async registrarTentativa() { return 1; }
}

describe("casos de uso do QR de captura", () => {
  it("gera token de 22 caracteres, entrega o link e manda SO O HASH para o repositorio", async () => {
    const repositorio = new RepositorioEmMemoria();
    const resultado = await gerarQrDeCaptura({ repositorio, aplicacaoUrl: "https://exemplo.com.br/" }, escopo, "u1");

    expect(resultado.token).toMatch(FORMATO_TOKEN_CAPTURA);
    expect(resultado.link).toBe(`https://exemplo.com.br/enviar/${resultado.token}`);
    expect(resultado.substituiuAnterior).toBe(false);
    expect(repositorio.hashesRecebidos).toEqual([hashDoTokenDeCaptura(resultado.token)]);
    expect(repositorio.hashesRecebidos[0]).not.toContain(resultado.token);
  });

  it("gerar de novo substitui o anterior, e o token antigo deixa de resolver", async () => {
    const repositorio = new RepositorioEmMemoria();
    const primeiro = await gerarQrDeCaptura({ repositorio, aplicacaoUrl: "https://exemplo.com.br" }, escopo, "u1");
    const segundo = await gerarQrDeCaptura({ repositorio, aplicacaoUrl: "https://exemplo.com.br" }, escopo, "u1");

    expect(segundo.substituiuAnterior).toBe(true);
    expect(segundo.token).not.toBe(primeiro.token);
    expect(await repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura(primeiro.token))).toBeNull();
    expect(await repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura(segundo.token))).not.toBeNull();
  });

  it("revogar diz se havia algo a revogar, e depois nao ha situacao ativa", async () => {
    const repositorio = new RepositorioEmMemoria();
    const dependencias = { repositorio, aplicacaoUrl: "https://exemplo.com.br" };
    expect(await revogarQrDeCaptura(dependencias, escopo, "u1")).toBe(false);
    await gerarQrDeCaptura(dependencias, escopo, "u1");
    expect(await situacaoDoQr(dependencias, escopo)).not.toBeNull();
    expect(await revogarQrDeCaptura(dependencias, escopo, "u1")).toBe(true);
    expect(await situacaoDoQr(dependencias, escopo)).toBeNull();
  });

  it("o limite por hora e configuravel por empresa, dentro de 1..500, e so com token ativo", async () => {
    const repositorio = new RepositorioEmMemoria();
    const dependencias = { repositorio, aplicacaoUrl: "https://exemplo.com.br" };
    expect(await definirLimiteDeEnvios(dependencias, escopo, 50, "u1")).toBe(false); // sem token ativo
    await gerarQrDeCaptura(dependencias, escopo, "u1");
    expect(await definirLimiteDeEnvios(dependencias, escopo, 0, "u1")).toBe(false);
    expect(await definirLimiteDeEnvios(dependencias, escopo, 501, "u1")).toBe(false);
    expect(await definirLimiteDeEnvios(dependencias, escopo, 50, "u1")).toBe(true);
    expect((await situacaoDoQr(dependencias, escopo))?.limiteEnviosHora).toBe(50);
  });
});
