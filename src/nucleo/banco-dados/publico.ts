/**
 * Interface publica do acesso ao banco. Apenas implementacoes de repositorio
 * (`infraestrutura/`), a composicao e verificacoes de saude devem usar isto.
 */
export {
  executarEmTransacao,
  obterBancoDados,
  type BancoDados,
  type ExecutorBancoDados,
  type TransacaoBancoDados,
} from "./conexao";
export { verificarConexaoBanco } from "./verificar-conexao";
