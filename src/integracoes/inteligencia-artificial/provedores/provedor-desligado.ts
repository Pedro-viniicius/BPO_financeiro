import type { AnaliseFinanceira, PerguntaFinanceira, ProvedorInteligenciaArtificial } from "../contratos/provedor-inteligencia-artificial";

/**
 * Provedor usado quando a IA nao esta contratada/configurada
 * (`IA_PROVEDOR=desligado`). Responde de forma honesta, sem inventar analise,
 * e devolve os pontos de atencao deterministicos que o sistema ja calculou.
 */
export class ProvedorDesligado implements ProvedorInteligenciaArtificial {
  readonly nome = "desligado";

  async analisar(pergunta: PerguntaFinanceira): Promise<AnaliseFinanceira> {
    return {
      conclusao:
        "O Assistente Financeiro nao esta ativo nesta instalacao. Os pontos de atencao abaixo foram calculados pelo sistema e continuam validos.",
      dadosUsados: pergunta.contexto.pontosAtencao ?? [],
      premissas: [],
      calculo: "Nenhum calculo adicional foi feito.",
      incerteza: "Sem analise interpretativa.",
      cenarios: [],
      provedor: this.nome,
      modelo: "nenhum",
    };
  }
}
