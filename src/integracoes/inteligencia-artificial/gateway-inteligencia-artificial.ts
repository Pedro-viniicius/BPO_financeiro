import type { RegistradorLogs } from "@/nucleo/observabilidade/publico";

import type { ContextoFinanceiro } from "./contratos/contexto-financeiro";
import type { AnaliseFinanceira, ProvedorInteligenciaArtificial } from "./contratos/provedor-inteligencia-artificial";
import { aplicarPoliticaDados } from "./politica-dados";

/**
 * Gateway (ponto unico de passagem) para a IA.
 *
 *   contexto calculado -> politica de dados -> provedor -> resposta estruturada
 *
 * E o unico lugar da aplicacao que chama um provedor de IA. Modulos financeiros
 * nunca importam provedores; recebem este gateway pela interface publica.
 */
export class ContextoBloqueadoPelaPolitica extends Error {
  constructor(readonly motivos: readonly string[]) {
    super("O contexto contem dados que nao podem ser enviados ao provedor de IA.");
    this.name = "ContextoBloqueadoPelaPolitica";
  }
}

export class GatewayInteligenciaArtificial {
  constructor(
    private readonly provedor: ProvedorInteligenciaArtificial,
    private readonly logs: RegistradorLogs,
  ) {}

  async perguntar(pergunta: string, contexto: ContextoFinanceiro): Promise<AnaliseFinanceira> {
    const politica = aplicarPoliticaDados(contexto);
    if (!politica.permitido) {
      this.logs.aviso("contexto de IA bloqueado pela politica de dados", { motivos: politica.motivos });
      throw new ContextoBloqueadoPelaPolitica(politica.motivos);
    }
    if (politica.motivos.length > 0) {
      this.logs.info("campos removidos do contexto de IA", { motivos: politica.motivos });
    }
    const inicio = Date.now();
    const analise = await this.provedor.analisar({ pergunta, contexto: politica.contextoFiltrado });
    this.logs.info("analise de IA concluida", { provedor: this.provedor.nome, duracaoMs: Date.now() - inicio });
    return analise;
  }
}
