import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ArmazenamentoArquivos, ArquivoGuardado, ArquivoParaGuardar } from "@/nucleo/arquivos/publico";

import { EnvioRecusado } from "../dominio/envio";
import { LIMITE_TOKENS_INVALIDOS_POR_IP_HORA, LimiteDeTentativasExcedido } from "../dominio/limite-tentativas";
import { gerarTokenDeCaptura } from "../dominio/token-captura";
import { autorizarEnvio, receberEnvio, resolverEnvio, TokenDeCapturaInvalido, type DependenciasEnvio } from "./receber-envio";
import { RepositorioCapturaEmMemoria } from "./testes/repositorio-captura-em-memoria";

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

function montar(opcoes: { readonly semSal?: boolean } = {}) {
  const token = gerarTokenDeCaptura();
  const repositorio = new RepositorioCapturaEmMemoria(token);
  const armazenamento = new ArmazenamentoEmMemoria();
  const relogio = { agora: new Date("2026-09-24T13:10:00Z") };
  const dependencias: DependenciasEnvio = {
    repositorio,
    armazenamentoDe: () => armazenamento,
    salDoIp: opcoes.semSal ? undefined : "s".repeat(32),
    agora: () => relogio.agora,
  };
  return { token, repositorio, armazenamento, dependencias, relogio };
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const arquivo = (nome: string, assinatura: number[], resto = nome) => ({
  nomeOriginal: nome,
  conteudo: new Uint8Array([...assinatura, ...new TextEncoder().encode(resto)]),
});
const remetente = { ip: "203.0.113.7", agenteUsuario: "Mozilla/5.0 (Android)" };
const IP = "203.0.113.7";

describe("resolver e autorizar o envio (ADR-031, ADR-033)", () => {
  it("token invalido e token de formato errado dao o MESMO erro, antes de qualquer arquivo", async () => {
    const { dependencias, armazenamento } = montar();
    await expect(resolverEnvio(dependencias, "nao-e-um-token", IP)).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    expect(armazenamento.guardados).toHaveLength(0);
  });

  it("dez tokens invalidos por hora do mesmo IP: o decimo primeiro e barrado como limite, nao como token", async () => {
    const { dependencias } = montar();
    for (let i = 0; i < LIMITE_TOKENS_INVALIDOS_POR_IP_HORA; i += 1) {
      await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    }
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toMatchObject({ alvo: "ip" });
    // Outro IP nao e afetado.
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), "198.51.100.9")).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
  });

  it("na hora seguinte a contagem do IP recomeca", async () => {
    const { dependencias, relogio } = montar();
    for (let i = 0; i <= LIMITE_TOKENS_INVALIDOS_POR_IP_HORA; i += 1) {
      await resolverEnvio(dependencias, gerarTokenDeCaptura(), IP).catch(() => undefined);
    }
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toMatchObject({ alvo: "ip" });
    relogio.agora = new Date("2026-09-24T14:00:00Z");
    await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
  });

  it("sem sal nao ha limite por IP — porque nunca se conta pelo IP em claro", async () => {
    const { dependencias, repositorio } = montar({ semSal: true });
    for (let i = 0; i < 30; i += 1) {
      await expect(resolverEnvio(dependencias, gerarTokenDeCaptura(), IP)).rejects.toBeInstanceOf(TokenDeCapturaInvalido);
    }
    expect(repositorio.tentativas.size).toBe(0);
  });

  it("token valido: envios contam contra o limite da empresa; o excedente e barrado antes do corpo", async () => {
    const { token, dependencias, repositorio } = montar();
    repositorio.limite = 3;
    for (let i = 0; i < 3; i += 1) expect((await autorizarEnvio(dependencias, token, IP)).tokenId).toBe("tok-1");
    await expect(autorizarEnvio(dependencias, token, IP)).rejects.toMatchObject({ alvo: "token" });
    // Ler a pagina (GET) nao conta.
    await expect(resolverEnvio(dependencias, token, IP)).resolves.toMatchObject({ tokenId: "tok-1" });
    // E tentativas invalidas de IP nao entram na conta do token.
    expect([...repositorio.tentativas.keys()].filter((c) => c.startsWith("token:"))).toHaveLength(1);
  });

  it("o erro de limite e um erro de dominio com mensagem sem numeros", async () => {
    const { token, dependencias, repositorio } = montar();
    repositorio.limite = 1;
    await autorizarEnvio(dependencias, token, IP);
    const erro = await autorizarEnvio(dependencias, token, IP).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(LimiteDeTentativasExcedido);
    expect((erro as Error).message).not.toMatch(/\d/);
  });
});

describe("receber envio pela pagina publica", () => {
  async function autorizado(dependencias: DependenciasEnvio, token: string) {
    return autorizarEnvio(dependencias, token, IP);
  }

  it("guarda os arquivos, cria o documento pendente e devolve o protocolo — com IP so anonimizado", async () => {
    const { token, dependencias, repositorio, armazenamento } = montar();
    const { codigo } = await receberEnvio(dependencias, await autorizado(dependencias, token), {
      arquivos: [arquivo("frente.jpg", JPEG), arquivo("verso.png", PNG)],
      observacao: "  nota do fornecedor X  ",
      remetente,
    });
    expect(codigo).toBe("DC-2026-000001");
    expect(armazenamento.guardados.map((a) => [a.nomeOriginal, a.tipoConteudo])).toEqual([["frente.jpg", "image/jpeg"], ["verso.png", "image/png"]]);
    const recebido = repositorio.recebidos[0]!;
    expect(recebido.tokenId).toBe("tok-1");
    expect(recebido.observacao).toBe("nota do fornecedor X");
    expect(recebido.arquivos).toHaveLength(2);
    expect(recebido.remetente.ipAnonimo).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(JSON.stringify(recebido)).not.toContain("203.0.113.7");
    expect(recebido.remetente.agenteUsuario).toBe("Mozilla/5.0 (Android)");
  });

  it("o tipo vem do CONTEUDO: um .exe chamado foto.jpg e recusado, e um PDF chamado nota.jpg entra como PDF", async () => {
    const { token, dependencias, armazenamento } = montar();
    await expect(
      receberEnvio(dependencias, await autorizado(dependencias, token), {
        arquivos: [{ nomeOriginal: "foto.jpg", conteudo: new TextEncoder().encode("MZ\x90\x00programa") }],
        observacao: null,
        remetente,
      }),
    ).rejects.toMatchObject({ motivo: "tipo_nao_permitido" });
    expect(armazenamento.guardados).toHaveLength(0);

    await receberEnvio(dependencias, await autorizado(dependencias, token), {
      arquivos: [{ nomeOriginal: "nota.jpg", conteudo: new TextEncoder().encode("%PDF-1.4 conteudo") }],
      observacao: null,
      remetente,
    });
    expect(armazenamento.guardados[0]!.tipoConteudo).toBe("application/pdf");
  });

  it("sem sal, o IP simplesmente nao vai — nunca em claro", async () => {
    const { token, dependencias, repositorio } = montar({ semSal: true });
    await receberEnvio(dependencias, await autorizado(dependencias, token), { arquivos: [arquivo("a.jpg", JPEG)], observacao: null, remetente });
    expect(repositorio.recebidos[0]!.remetente.ipAnonimo).toBeNull();
  });

  it("o mesmo conteudo ja guardado pela empresa e reaproveitado, e repetido no mesmo envio conta uma vez", async () => {
    const { token, dependencias, repositorio, armazenamento } = montar();
    const igual = arquivo("a.jpg", JPEG, "mesma-foto");
    repositorio.impressoesConhecidas.set(createHash("sha256").update(igual.conteudo).digest("hex"), "arq-antigo");
    await receberEnvio(dependencias, await autorizado(dependencias, token), {
      arquivos: [igual, { ...igual, nomeOriginal: "b.jpg" }, arquivo("c.jpg", JPEG, "outra")],
      observacao: null,
      remetente,
    });
    expect(armazenamento.guardados.map((a) => a.nomeOriginal)).toEqual(["c.jpg"]);
    expect(repositorio.recebidos[0]!.arquivos).toEqual([{ existenteId: "arq-antigo" }, expect.objectContaining({ novo: expect.anything() })]);
  });

  it("envio sem arquivo ou grande demais e recusado ANTES de tocar o disco", async () => {
    const { token, dependencias, armazenamento } = montar();
    const ok = await autorizado(dependencias, token);
    await expect(receberEnvio(dependencias, ok, { arquivos: [], observacao: null, remetente })).rejects.toBeInstanceOf(EnvioRecusado);
    const grande = new Uint8Array(15 * 1024 * 1024 + 1); grande.set(JPEG);
    await expect(
      receberEnvio(dependencias, ok, { arquivos: [{ nomeOriginal: "g.jpg", conteudo: grande }], observacao: null, remetente }),
    ).rejects.toMatchObject({ motivo: "arquivo_grande" });
    expect(armazenamento.guardados).toHaveLength(0);
  });
});
