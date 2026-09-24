import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import type { ArmazenamentoArquivos, ArquivoGuardado, ArquivoParaGuardar } from "@/nucleo/arquivos/publico";

import { EnvioRecusado } from "../dominio/envio";
import { gerarTokenDeCaptura, hashDoTokenDeCaptura } from "../dominio/token-captura";
import { receberEnvio, resolverEnvio, TokenDeCapturaInvalido, type DependenciasEnvio } from "./receber-envio";
import type { DadosDoEnvio, EscopoResolvidoPorToken, RepositorioCaptura } from "./repositorio-captura";

const escopo: EscopoEmpresa = {
  organizacaoId: comoIdentificador<"Organizacao">("org-1"),
  empresaId: comoIdentificador<"Empresa">("emp-1"),
};

class ArmazenamentoEmMemoria implements ArmazenamentoArquivos {
  guardados: ArquivoParaGuardar[] = [];
  async guardar(arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado> {
    this.guardados.push(arquivo);
    return {
      chave: `emp-1/2026/09/${this.guardados.length}.bin`,
      tamanhoBytes: arquivo.conteudo.byteLength,
      impressaoDigital: createHash("sha256").update(arquivo.conteudo).digest("hex"),
    };
  }
  async obter() { return null; }
  async remover() {}
}

class RepositorioEmMemoria implements RepositorioCaptura {
  readonly tokenValido: string;
  readonly impressoesConhecidas = new Map<string, string>();
  recebidos: DadosDoEnvio[] = [];
  constructor(token: string) { this.tokenValido = hashDoTokenDeCaptura(token); }
  async obterTokenAtivo() { return null; }
  async gerarToken() { return { id: "t", substituiuAnterior: false }; }
  async revogarToken() { return false; }
  async resolverEscopoPorToken(hash: string): Promise<EscopoResolvidoPorToken | null> {
    return hash === this.tokenValido ? { escopo, tokenId: "tok-1", limiteEnviosHora: 20, nomeEmpresa: "Nova Didata" } : null;
  }
  async procurarArquivoPorImpressao(_e: EscopoEmpresa, impressao: string) {
    const id = this.impressoesConhecidas.get(impressao);
    return id ? { id } : null;
  }
  async receberDocumento(_e: EscopoEmpresa, dados: DadosDoEnvio) {
    this.recebidos.push(dados);
    return { id: `doc-${this.recebidos.length}`, codigo: `DC-2026-${String(this.recebidos.length).padStart(6, "0")}` };
  }
  async contarPendentes() { return this.recebidos.length; }
}

function montar() {
  const token = gerarTokenDeCaptura();
  const repositorio = new RepositorioEmMemoria(token);
  const armazenamento = new ArmazenamentoEmMemoria();
  const dependencias: DependenciasEnvio = { repositorio, armazenamentoDe: () => armazenamento, salDoIp: "s".repeat(32) };
  return { token, repositorio, armazenamento, dependencias };
}

const foto = (nome: string, conteudo: string) => ({ nomeOriginal: nome, tipoConteudo: "image/jpeg", conteudo: new TextEncoder().encode(conteudo) });
const remetente = { ip: "203.0.113.7", agenteUsuario: "Mozilla/5.0 (Android)" };

describe("receber envio pela pagina publica", () => {
  it("token invalido e token de formato errado dao o MESMO erro, antes de qualquer arquivo", async () => {
    const { dependencias, armazenamento } = montar();
    await expect(resolverEnvio(dependencias, "nao-e-um-token")).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura())).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    await expect(
      receberEnvio(dependencias, gerarTokenDeCaptura(), { arquivos: [foto("a.jpg", "x")], observacao: null, remetente }),
    ).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    expect(armazenamento.guardados).toHaveLength(0);
  });

  it("guarda os arquivos, cria o documento pendente e devolve o protocolo — com IP so anonimizado", async () => {
    const { token, dependencias, repositorio, armazenamento } = montar();
    const { codigo } = await receberEnvio(dependencias, token, {
      arquivos: [foto("frente.jpg", "frente"), foto("verso.jpg", "verso")],
      observacao: "  nota do fornecedor X  ",
      remetente,
    });
    expect(codigo).toBe("DC-2026-000001");
    expect(armazenamento.guardados.map((a) => a.nomeOriginal)).toEqual(["frente.jpg", "verso.jpg"]);
    const recebido = repositorio.recebidos[0]!;
    expect(recebido.tokenId).toBe("tok-1");
    expect(recebido.observacao).toBe("nota do fornecedor X");
    expect(recebido.arquivos).toHaveLength(2);
    expect(recebido.remetente.ipAnonimo).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(JSON.stringify(recebido)).not.toContain("203.0.113.7");
    expect(recebido.remetente.agenteUsuario).toBe("Mozilla/5.0 (Android)");
  });

  it("sem sal, o IP simplesmente nao vai — nunca em claro", async () => {
    const { token, dependencias, repositorio } = montar();
    await receberEnvio({ ...dependencias, salDoIp: undefined }, token, { arquivos: [foto("a.jpg", "a")], observacao: null, remetente });
    expect(repositorio.recebidos[0]!.remetente.ipAnonimo).toBeNull();
  });

  it("o mesmo conteudo ja guardado pela empresa e reaproveitado, e repetido no mesmo envio conta uma vez", async () => {
    const { token, dependencias, repositorio, armazenamento } = montar();
    const conteudo = "mesma-foto";
    repositorio.impressoesConhecidas.set(createHash("sha256").update(conteudo).digest("hex"), "arq-antigo");
    await receberEnvio(dependencias, token, {
      arquivos: [foto("a.jpg", conteudo), foto("b.jpg", conteudo), foto("c.jpg", "outra")],
      observacao: null,
      remetente,
    });
    expect(armazenamento.guardados.map((a) => a.nomeOriginal)).toEqual(["c.jpg"]);
    expect(repositorio.recebidos[0]!.arquivos).toEqual([{ existenteId: "arq-antigo" }, expect.objectContaining({ novo: expect.anything() })]);
  });

  it("envio sem arquivo, com tipo proibido ou grande demais e recusado ANTES de tocar o disco", async () => {
    const { token, dependencias, armazenamento } = montar();
    await expect(receberEnvio(dependencias, token, { arquivos: [], observacao: null, remetente })).rejects.toBeInstanceOf(EnvioRecusado);
    await expect(
      receberEnvio(dependencias, token, { arquivos: [{ nomeOriginal: "v.exe", tipoConteudo: "application/x-msdownload", conteudo: new Uint8Array(3) }], observacao: null, remetente }),
    ).rejects.toMatchObject({ motivo: "tipo_nao_permitido" });
    await expect(
      receberEnvio(dependencias, token, { arquivos: [{ nomeOriginal: "g.jpg", tipoConteudo: "image/jpeg", conteudo: new Uint8Array(15 * 1024 * 1024 + 1) }], observacao: null, remetente }),
    ).rejects.toMatchObject({ motivo: "arquivo_grande" });
    expect(armazenamento.guardados).toHaveLength(0);
  });
});
