/**
 * Regras fiscais brasileiras PURAS (sem banco, sem Node): usaveis tanto no
 * servidor quanto no navegador. Por isso a chave de acesso vive aqui, e nao
 * no dominio de um modulo — a pagina publica a le no aparelho (ADR-029).
 */
export {
  ChaveDeAcessoInvalida, digitoVerificador, extrairChaveDeTexto, FORMATO_CHAVE_DE_ACESSO, interpretarChaveDeAcesso,
  MODELOS, normalizarChaveDeAcesso, type ChaveDeAcesso,
} from "./chave-de-acesso";
