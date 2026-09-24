import { createHash, randomBytes } from "node:crypto";

/**
 * O token que vai dentro do QR code de uma empresa.
 *
 * Mesmo padrao de `convites` (Gate 9): o banco guarda SO O HASH. Com o hash,
 * um vazamento do banco nao da a ninguem o direito de enviar documento em
 * nome de uma empresa — quem tem o QR continua sendo so quem o recebeu.
 *
 * Sao 16 bytes (128 bits de entropia), nao os 32 dos convites, de proposito:
 * o token vira URL dentro de um QR impresso. Com 22 caracteres a URL de
 * producao tem 66 bytes e cai na versao 5 do QR (37x37); com os 43 dos
 * convites teria 87 e iria para a versao 6. QR menos denso e QR que le na
 * primeira tentativa num celular fraco — e 128 bits ja sao inadivinhaveis.
 */
export const TAMANHO_TOKEN_BYTES = 16;

/** 16 bytes em base64url dao exatamente 22 caracteres deste alfabeto. */
export const FORMATO_TOKEN_CAPTURA = /^[A-Za-z0-9_-]{22}$/;

export function gerarTokenDeCaptura(): string {
  return randomBytes(TAMANHO_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 em hexadecimal. E o que vai para o banco. */
export function hashDoTokenDeCaptura(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Conferencia barata ANTES de ir ao banco: texto fora do formato nem vira
 * consulta. E a primeira porta do limite de tentativas.
 */
export function temFormatoDeToken(texto: string): boolean {
  return FORMATO_TOKEN_CAPTURA.test(texto);
}

/** A URL que o QR codifica. Curta de proposito (ver acima). */
export function linkDeEnvio(aplicacaoUrl: string, token: string): string {
  return `${aplicacaoUrl.replace(/\/$/, "")}/enviar/${token}`;
}
