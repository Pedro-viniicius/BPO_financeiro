import type { IdEmpresa, IdFilial, IdOrganizacao } from "./identificadores";

/**
 * Escopo empresarial de um registro ou de uma consulta.
 *
 * Toda consulta a dados financeiros recebe um `EscopoEmpresa` e filtra por
 * `empresaId` no servidor. `filialId` e opcional: nem todo registro pertence
 * a uma filial. Ver ADR-005 (single-tenant por instalacao, multiempresa).
 */
export interface EscopoEmpresa {
  readonly organizacaoId: IdOrganizacao;
  readonly empresaId: IdEmpresa;
  readonly filialId?: IdFilial;
}
