import { describe, expect, it } from "vitest";

import { FORMATO_TOKEN_CAPTURA, hashDoTokenDeCaptura } from "../dominio/token-captura";
import { definirLimiteDeEnvios, gerarQrDeCaptura, revogarQrDeCaptura, situacaoDoQr } from "./casos-de-uso-qr";
import { escopoDeTeste, RepositorioCapturaEmMemoria } from "./testes/repositorio-captura-em-memoria";

const escopo = escopoDeTeste;
type RepositorioEmMemoria = RepositorioCapturaEmMemoria;
const RepositorioEmMemoria = RepositorioCapturaEmMemoria;

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
