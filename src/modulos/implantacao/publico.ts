/**
 * Interface publica do modulo "implantacao".
 *
 * A carga inicial: trazer para dentro do sistema a situacao em que a empresa
 * ja estava no dia em que comecou a usa-lo. Outros modulos importam SOMENTE
 * daqui.
 */
export {
  COLUNAS_CONTAS,
  COLUNAS_PESSOAS,
  MAXIMO_BYTES,
  MAXIMO_LINHAS,
  validarPlanilhaDeContas,
  validarPlanilhaDePessoas,
  type ContaImportada,
  type ErroDaLinha,
  type PessoaImportada,
} from "./dominio/planilhas";
export { modeloDeContas, modeloDePessoas } from "./dominio/modelos";
export { LoteNaoEncontrado, LoteNaoPodeSerDesfeito, MOTIVO_ITEM_EM_USO } from "./dominio/erros";
export type {
  EtapaDaImplantacao,
  LoteDeImportacao,
  RepositorioImplantacao,
  ResultadoDaImportacao,
  SituacaoDaEtapa,
} from "./aplicacao/repositorio-implantacao";
export { RepositorioImplantacaoDrizzle } from "./infraestrutura/repositorio-implantacao-drizzle";
