/** Interface publica de licenciamento. O dominio financeiro so conhece `PortaoRecursos`. */
export {
  RECURSOS,
  RECURSOS_BASE_VERSAO_1,
  RECURSOS_CONTRATADOS_SEPARADAMENTE,
  type PortaoRecursos,
  type Recurso,
} from "./portao-recursos";
export { esquemaLicenca, recursosDaLicenca, type LeitorLicenca, type Licenca } from "./licenca";
export { PortaoRecursosPorLicenca } from "./portao-recursos-por-licenca";
