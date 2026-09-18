import { type Licenca, recursosDaLicenca } from "./licenca";
import { type PortaoRecursos, RECURSOS_BASE_VERSAO_1, type Recurso } from "./portao-recursos";

/** Implementacao do portao de recursos a partir de uma licenca (ou do modo base). */
export class PortaoRecursosPorLicenca implements PortaoRecursos {
  private readonly habilitados: ReadonlySet<Recurso>;

  constructor(licenca: Licenca | null, recursosBase: readonly Recurso[] = RECURSOS_BASE_VERSAO_1) {
    this.habilitados = recursosDaLicenca(licenca, recursosBase);
  }

  estaHabilitado(recurso: Recurso): boolean {
    return this.habilitados.has(recurso);
  }

  recursosHabilitados(): ReadonlySet<Recurso> {
    return this.habilitados;
  }
}
