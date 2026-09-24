import type { DataCivil } from "@/compartilhado/datas/indice";
import type { ArmazenamentoArquivos } from "@/nucleo/arquivos/publico";
import type { ManipuladorTarefa, PedidoTarefa } from "@/nucleo/tarefas/publico";

import { ABANDONO_DIAS, dataCivilDoInstante, marcoDeRetencaoArquivado } from "../dominio/conferencia";
import type { RepositorioCaptura } from "./repositorio-captura";

export const TIPO_TAREFA_RETENCAO = "captura.retencao_diaria";
const DIA_MS = 24 * 60 * 60 * 1000;
/** Janelas de tentativas duram uma hora; dois dias e folga de sobra para investigar um pico. */
export const TENTATIVAS_GUARDADAS_DIAS = 2;

export interface DependenciasRetencao {
  readonly repositorio: RepositorioCaptura;
  readonly armazenamentoDe: (empresaId: string) => ArmazenamentoArquivos;
  readonly registrar: (mensagem: string, dados: Record<string, unknown>) => void;
  readonly agora?: () => Date;
}

export interface ResultadoRetencao {
  readonly arquivados: number;
  readonly expurgados: number;
  readonly arquivosRemovidos: number;
  readonly tentativasApagadas: number;
}

/**
 * Uma execucao da retencao: por empresa, arquiva os abandonados (90 dias na
 * fila) e expurga o conteudo dos vencidos; depois limpa as janelas de
 * tentativas. Origem "tarefa" na trilha — ninguem decidiu, o prazo venceu.
 *
 * O conteudo sai do disco DEPOIS de a transacao fechar. Se a remocao falhar,
 * sobra um arquivo orfao no disco (inofensivo) com a linha ja marcada — nunca
 * o contrario, uma linha viva sem arquivo.
 */
export async function executarRetencaoDiaria(dependencias: DependenciasRetencao): Promise<ResultadoRetencao> {
  const agora = dependencias.agora?.() ?? new Date();
  const hoje = dataCivilDoInstante(agora);
  const limiteAbandono = new Date(agora.getTime() - ABANDONO_DIAS * DIA_MS);
  const resultado = { arquivados: 0, expurgados: 0, arquivosRemovidos: 0, tentativasApagadas: 0 };

  for (const escopo of await dependencias.repositorio.listarEscoposComDocumentos()) {
    const arquivados = await dependencias.repositorio.arquivarAbandonados(escopo, limiteAbandono, marcoDeRetencaoArquivado);
    resultado.arquivados += arquivados.length;

    const expurgo = await dependencias.repositorio.expurgarVencidos(escopo, hoje);
    resultado.expurgados += expurgo.documentos.length;
    const armazenamento = dependencias.armazenamentoDe(escopo.empresaId);
    for (const chave of expurgo.chavesParaRemover) {
      try {
        await armazenamento.remover(chave);
        resultado.arquivosRemovidos += 1;
      } catch (erro) {
        dependencias.registrar("retencao: falha ao remover conteudo expurgado (fica orfao no disco)", { chave, erro: String(erro) });
      }
    }
    if (arquivados.length > 0 || expurgo.documentos.length > 0) {
      dependencias.registrar("retencao executada para a empresa", {
        empresaId: escopo.empresaId, arquivados: arquivados, expurgados: expurgo.documentos, arquivosRemovidos: expurgo.chavesParaRemover.length,
      });
    }
  }

  resultado.tentativasApagadas = await dependencias.repositorio.limparTentativas(new Date(agora.getTime() - TENTATIVAS_GUARDADAS_DIAS * DIA_MS));
  return resultado;
}

/** Um pedido por dia: a chave de idempotencia impede o segundo. */
export function pedidoDeRetencaoDiaria(hoje: DataCivil): PedidoTarefa {
  return { tipo: TIPO_TAREFA_RETENCAO, dados: { dia: hoje }, chaveIdempotencia: `${TIPO_TAREFA_RETENCAO}:${hoje}`, maximoTentativas: 3 };
}

export function manipuladorDeRetencao(dependencias: DependenciasRetencao): ManipuladorTarefa {
  return {
    tipo: TIPO_TAREFA_RETENCAO,
    async executar() {
      const resultado = await executarRetencaoDiaria(dependencias);
      dependencias.registrar("retencao diaria concluida", { ...resultado });
    },
  };
}
