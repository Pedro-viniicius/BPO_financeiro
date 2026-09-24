/**
 * Limita o corpo de uma requisicao PELOS BYTES QUE CHEGAM, e nao pelo que o
 * cliente declarou.
 *
 * `Content-Length` e uma promessa de quem envia. Uma requisicao em pedacos
 * (`Transfer-Encoding: chunked`) simplesmente nao o traz — e `formData()`
 * leria o corpo inteiro para a memoria antes de qualquer conferencia. Aqui o
 * fluxo e contado enquanto passa e interrompido no primeiro byte alem do teto:
 * o que nao chegou nunca ocupa memoria.
 *
 * Nao substitui o corte no proxy (Caddy, `request_body`), que acontece antes
 * ainda; e a segunda linha, para quando a aplicacao e alcancada sem ele.
 */
export class CorpoAcimaDoLimite extends Error {
  constructor(readonly limiteBytes: number) {
    super(`O corpo da requisicao passou de ${limiteBytes} bytes.`);
    this.name = "CorpoAcimaDoLimite";
  }
}

export function ehCorpoAcimaDoLimite(erro: unknown): erro is CorpoAcimaDoLimite {
  return erro instanceof CorpoAcimaDoLimite;
}

/** Um fluxo que espelha `origem` e falha assim que a soma dos bytes passa de `maximoBytes`. */
export function limitarFluxo(origem: ReadableStream<Uint8Array>, maximoBytes: number): ReadableStream<Uint8Array> {
  let lidos = 0;
  return origem.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(pedaco, controlador) {
        lidos += pedaco.byteLength;
        if (lidos > maximoBytes) {
          controlador.error(new CorpoAcimaDoLimite(maximoBytes));
          return;
        }
        controlador.enqueue(pedaco);
      },
    }),
  );
}

/**
 * A mesma requisicao, com o corpo limitado. `Content-Length` sai dos
 * cabecalhos porque deixou de ser confiavel para o novo corpo; o
 * `Content-Type` (com o `boundary` do multipart) fica, que e o que `formData()`
 * precisa. Requisicao sem corpo volta como veio.
 */
export function comCorpoLimitado(requisicao: Request, maximoBytes: number): Request {
  if (!requisicao.body) return requisicao;
  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.delete("content-length");
  return new Request(requisicao.url, {
    method: requisicao.method,
    headers: cabecalhos,
    body: limitarFluxo(requisicao.body, maximoBytes),
    // Exigido pela plataforma para corpo em fluxo. Ainda nao esta na tipagem padrao.
    duplex: "half",
  } as RequestInit);
}
