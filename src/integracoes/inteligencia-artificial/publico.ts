/** Interface publica da integracao com IA. Modulos financeiros usam apenas isto. */
export type * from "./contratos/contexto-financeiro";
export type { AnaliseFinanceira, PerguntaFinanceira, ProvedorInteligenciaArtificial } from "./contratos/provedor-inteligencia-artificial";
export { aplicarPoliticaDados, type ResultadoPolitica } from "./politica-dados";
export { ContextoBloqueadoPelaPolitica, GatewayInteligenciaArtificial } from "./gateway-inteligencia-artificial";
export { ProvedorDesligado } from "./provedores/provedor-desligado";
