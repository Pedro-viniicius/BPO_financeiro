/** Interface publica do armazenamento de arquivos (anexos). */
export {
  TAMANHO_MAXIMO_ARQUIVO_BYTES,
  TIPOS_CONTEUDO_PERMITIDOS,
  type ArmazenamentoArquivos,
  type ArquivoGuardado,
  type ArquivoParaGuardar,
} from "./armazenamento-arquivos";
export { ArmazenamentoArquivosLocal } from "./infraestrutura/armazenamento-arquivos-local";
