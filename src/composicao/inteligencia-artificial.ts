import { GatewayInteligenciaArtificial, ProvedorDesligado } from "@/integracoes/inteligencia-artificial/publico";
import type { ProvedorInteligenciaArtificial } from "@/integracoes/inteligencia-artificial/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import type { PortaoRecursos } from "@/nucleo/licenciamento/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

/**
 * Escolhe o provedor de IA conforme licenca e configuracao.
 *
 * - Recurso "analises_ia" nao contratado -> provedor desligado, sempre.
 * - `IA_PROVEDOR=desligado` -> provedor desligado.
 * - Demais provedores serao adicionados no Gate 9 (cada um em
 *   `integracoes/inteligencia-artificial/provedores/<nome>/`).
 */
export function montarGatewayInteligenciaArtificial(portao: PortaoRecursos): GatewayInteligenciaArtificial {
  const variaveis = obterVariaveisAmbiente();
  const logs = criarRegistradorLogs("inteligencia-artificial");

  let provedor: ProvedorInteligenciaArtificial = new ProvedorDesligado();
  if (portao.estaHabilitado("analises_ia") && variaveis.IA_PROVEDOR !== "desligado") {
    logs.aviso("provedor de IA configurado mas ainda nao implementado; usando provedor desligado", {
      provedorConfigurado: variaveis.IA_PROVEDOR,
    });
    provedor = new ProvedorDesligado();
  }

  return new GatewayInteligenciaArtificial(provedor, logs);
}
