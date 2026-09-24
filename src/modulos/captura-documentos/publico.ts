/**
 * Interface publica do modulo de captura de documentos (Gate 10).
 *
 * Documento recebido pelo QR code NAO e conta a pagar: fica em fila propria
 * e a conta so nasce na aprovacao. Ver LEIA-ME.md.
 */
export { definirLimiteDeEnvios, gerarQrDeCaptura, revogarQrDeCaptura, situacaoDoQr, type DependenciasQr, type QrGerado } from "./aplicacao/casos-de-uso-qr";
export type { ArquivoDoEnvio, DadosDoEnvio, EscopoResolvidoPorToken, NovoArquivo, RepositorioCaptura, TokenDeCapturaAtivo } from "./aplicacao/repositorio-captura";
export {
  autorizarEnvio, receberEnvio, resolverEnvio, TokenDeCapturaInvalido,
  type ArquivoEnviado, type DependenciasEnvio, type Envio,
} from "./aplicacao/receber-envio";
export {
  LIMITE_ENVIOS_HORA_MAXIMO, LIMITE_ENVIOS_HORA_PADRAO, LIMITE_TOKENS_INVALIDOS_POR_IP_HORA, LimiteDeTentativasExcedido,
} from "./dominio/limite-tentativas";
export {
  EnvioRecusado, FORMATO_PROTOCOLO, MAXIMO_ARQUIVOS_POR_ENVIO, MENSAGENS_DE_RECUSA, TAMANHO_MAXIMO_ENVIO_BYTES, TAMANHO_MAXIMO_OBSERVACAO,
  TIPOS_ACEITOS_NA_CAPTURA, type MotivoRecusa,
} from "./dominio/envio";
export { FORMATO_TOKEN_CAPTURA, hashDoTokenDeCaptura, linkDeEnvio, temFormatoDeToken } from "./dominio/token-captura";
export { RepositorioCapturaDrizzle } from "./infraestrutura/repositorio-captura-drizzle";
export {
  abrirDocumento, aprovarDocumento, reabrirDocumento, rejeitarDocumento,
  type DependenciasConferencia, type DocumentoParaConferir, type EntradaDeAprovacao,
} from "./aplicacao/conferir-documento";
export type { AnexoDoDocumento, DocumentoDetalhado, DocumentoNaFila, FiltroDaFila } from "./aplicacao/repositorio-captura";
export {
  ABANDONO_DIAS, AVISO_PENDENTE_DIAS, DocumentoNaoEncontrado, DocumentoNaoPendente, DocumentoNaoReabrivel,
  MotivoDeRejeicaoInvalido, NOMES_SITUACAO_DOCUMENTO, podeReabrir, TAMANHO_MAXIMO_MOTIVO, type SituacaoDocumento,
} from "./dominio/conferencia";
