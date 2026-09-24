import { describe, expect, it } from "vitest";

import { comCorpoLimitado, CorpoAcimaDoLimite, ehCorpoAcimaDoLimite } from "./corpo-limitado";

const MB = 1024 * 1024;

/** Um corpo em pedacos de 1 MB, SEM Content-Length — como uma transferencia `chunked`. */
function corpoEmPedacos(pedacos: number): ReadableStream<Uint8Array> {
  let enviados = 0;
  return new ReadableStream<Uint8Array>({
    pull(controlador) {
      if (enviados >= pedacos) {
        controlador.close();
        return;
      }
      controlador.enqueue(new Uint8Array(MB));
      enviados += 1;
    },
  });
}

function requisicaoSemContentLength(pedacos: number): Request {
  return new Request("http://teste.local/enviar/x/receber", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: corpoEmPedacos(pedacos),
    duplex: "half",
  } as RequestInit);
}

describe("corpo limitado pelos bytes que chegam", () => {
  it("recusa corpo acima do teto MESMO sem Content-Length, sem esperar o fim", async () => {
    const limitada = comCorpoLimitado(requisicaoSemContentLength(50), 41 * MB);
    let erro: unknown;
    try {
      await limitada.arrayBuffer();
    } catch (capturado) {
      erro = capturado;
    }
    expect(ehCorpoAcimaDoLimite(erro)).toBe(true);
    expect((erro as CorpoAcimaDoLimite).limiteBytes).toBe(41 * MB);
  });

  it("deixa passar um corpo dentro do teto, inteiro", async () => {
    const limitada = comCorpoLimitado(requisicaoSemContentLength(3), 41 * MB);
    const corpo = await limitada.arrayBuffer();
    expect(corpo.byteLength).toBe(3 * MB);
  });

  it("um Content-Length mentiroso nao ajuda: o que conta e o que chega", async () => {
    // Declara 10 bytes, manda 5 MB. O cabecalho e descartado e os bytes sao contados.
    const original = new Request("http://teste.local/enviar/x/receber", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "content-length": "10" },
      body: corpoEmPedacos(5),
      duplex: "half",
    } as RequestInit);
    const limitada = comCorpoLimitado(original, 2 * MB);
    expect(limitada.headers.get("content-length")).toBeNull();
    expect(limitada.headers.get("content-type")).toBe("application/octet-stream");
    await expect(limitada.arrayBuffer()).rejects.toBeInstanceOf(CorpoAcimaDoLimite);
  });

  it("um multipart pequeno continua sendo lido por formData()", async () => {
    const formulario = new FormData();
    formulario.set("observacao", "nota do fornecedor");
    formulario.set("arquivos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "foto.jpg", { type: "image/jpeg" }));
    const original = new Request("http://teste.local/enviar/x/receber", { method: "POST", body: formulario });

    const lido = await comCorpoLimitado(original, MB).formData();
    expect(lido.get("observacao")).toBe("nota do fornecedor");
    expect((lido.get("arquivos") as File).size).toBe(4);
  });

  it("requisicao sem corpo volta como veio", () => {
    const original = new Request("http://teste.local/enviar/x", { method: "GET" });
    expect(comCorpoLimitado(original, MB)).toBe(original);
  });
});
