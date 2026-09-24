/**
 * Tipo de um arquivo pelo CONTEUDO — os primeiros bytes —, nunca pelo nome
 * nem pelo `Content-Type` que o cliente declarou (ADR-032). Extensao e
 * cabecalho vem de quem envia; a assinatura vem do arquivo.
 *
 * So os tipos que tem assinatura confiavel entram aqui. CSV, texto e OFX nao
 * tem — sao texto — e por isso a captura publica nem os aceita.
 *
 * O que NAO se faz aqui: interpretar o arquivo. Um PDF que comeca com
 * "%PDF-" e esta corrompido por dentro passa — e e guardado como veio, nunca
 * renderizado nem extraido no servidor. Validar PDF a fundo exigiria
 * interpretar PDF, que e exatamente o que nao se quer fazer com conteudo
 * nao confiavel.
 */
export type TipoDetectavel = "image/jpeg" | "image/png" | "application/pdf";

const ASSINATURAS: readonly { readonly tipo: TipoDetectavel; readonly bytes: readonly number[] }[] = [
  { tipo: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { tipo: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { tipo: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];

export function detectarTipoPorConteudo(conteudo: Uint8Array): TipoDetectavel | null {
  for (const assinatura of ASSINATURAS) {
    if (conteudo.byteLength < assinatura.bytes.length) continue;
    if (assinatura.bytes.every((byte, indice) => conteudo[indice] === byte)) return assinatura.tipo;
  }
  return null;
}
