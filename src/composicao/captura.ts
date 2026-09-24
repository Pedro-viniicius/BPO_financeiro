import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { RepositorioCapturaDrizzle, type DependenciasEnvio } from "@/modulos/captura-documentos/publico";

import { montarArmazenamentoArquivos } from "./arquivos";

/**
 * Dependencias da pagina publica de envio. E a unica composicao do sistema
 * que serve uma rota SEM sessao (ADR-033): por isso ela nao passa por
 * `exigirContextoFinanceiro`, e sim pelo token, dentro do caso de uso.
 */
export function montarDependenciasEnvio(): DependenciasEnvio {
  return {
    repositorio: new RepositorioCapturaDrizzle(obterBancoDados()),
    armazenamentoDe: montarArmazenamentoArquivos,
    salDoIp: obterVariaveisAmbiente().AUDITORIA_SAL_IP,
  };
}
