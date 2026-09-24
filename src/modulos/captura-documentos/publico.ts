/**
 * Interface publica do modulo de captura de documentos (Gate 10).
 *
 * Documento recebido pelo QR code NAO e conta a pagar: fica em fila propria
 * e a conta so nasce na aprovacao. Ver LEIA-ME.md.
 */
export { gerarQrDeCaptura, revogarQrDeCaptura, situacaoDoQr, type DependenciasQr, type QrGerado } from "./aplicacao/casos-de-uso-qr";
export type { ArquivoDoEnvio, DadosDoEnvio, EscopoResolvidoPorToken, NovoArquivo, RepositorioCaptura, TokenDeCapturaAtivo } from "./aplicacao/repositorio-captura";
export {
  receberEnvio, resolverEnvio, TokenDeCapturaInvalido,
  type ArquivoEnviado, type DependenciasEnvio, type Envio,
} from "./aplicacao/receber-envio";
export {
  EnvioRecusado, FORMATO_PROTOCOLO, MAXIMO_ARQUIVOS_POR_ENVIO, MENSAGENS_DE_RECUSA, TAMANHO_MAXIMO_ENVIO_BYTES, TAMANHO_MAXIMO_OBSERVACAO,
  TIPOS_ACEITOS_NA_CAPTURA, type MotivoRecusa,
} from "./dominio/envio";
export { FORMATO_TOKEN_CAPTURA, hashDoTokenDeCaptura, linkDeEnvio, temFormatoDeToken } from "./dominio/token-captura";
export { RepositorioCapturaDrizzle } from "./infraestrutura/repositorio-captura-drizzle";
