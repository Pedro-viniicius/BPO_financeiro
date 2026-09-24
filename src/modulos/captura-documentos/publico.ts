/**
 * Interface publica do modulo de captura de documentos (Gate 10).
 *
 * Documento recebido pelo QR code NAO e conta a pagar: fica em fila propria
 * e a conta so nasce na aprovacao. Ver LEIA-ME.md.
 */
export { gerarQrDeCaptura, revogarQrDeCaptura, situacaoDoQr, type DependenciasQr, type QrGerado } from "./aplicacao/casos-de-uso-qr";
export type { EscopoResolvidoPorToken, RepositorioCaptura, TokenDeCapturaAtivo } from "./aplicacao/repositorio-captura";
export { FORMATO_TOKEN_CAPTURA, hashDoTokenDeCaptura, linkDeEnvio, temFormatoDeToken } from "./dominio/token-captura";
export { RepositorioCapturaDrizzle } from "./infraestrutura/repositorio-captura-drizzle";
