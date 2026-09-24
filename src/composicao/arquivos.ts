import { ArmazenamentoArquivosLocal, type ArmazenamentoArquivos } from "@/nucleo/arquivos/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";

/**
 * Escolhe o armazenamento de arquivos. Unico lugar que conhece a
 * implementacao concreta (disco local, por enquanto — ver ADR-027).
 *
 * O armazenamento e por EMPRESA: a chave de todo arquivo comeca pelo id da
 * empresa (namespace), e a instancia nao consegue montar caminho fora dele.
 */
export function montarArmazenamentoArquivos(empresaId: string): ArmazenamentoArquivos {
  return new ArmazenamentoArquivosLocal(obterVariaveisAmbiente().ARQUIVOS_DIRETORIO, empresaId);
}

/**
 * A captura por QR code precisa de disco que persista. Na Vercel
 * (`AMBIENTE=demonstracao`) o sistema de arquivos e efemero: o documento
 * sumiria no proximo deploy. Em vez de um erro sem explicacao, a pagina
 * publica mostra que o envio esta desligado neste ambiente.
 */
export function capturaDisponivelNesteAmbiente(): boolean {
  return obterVariaveisAmbiente().AMBIENTE !== "demonstracao";
}
