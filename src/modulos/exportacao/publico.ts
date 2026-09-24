/**
 * Interface publica do modulo "exportacao".
 * Leva os dados da empresa embora, em CSV, num ZIP so.
 */
export { CONJUNTOS, type ConjuntoExportado } from "./dominio/conjunto-de-dados";
export type { PacoteExportado, ParteDeAnexos, RepositorioExportacao } from "./aplicacao/repositorio-exportacao";
export { ParteGrandeDemais, TETO_PARTE_ANEXOS_BYTES } from "./dominio/parte-de-anexos";
export { RepositorioExportacaoDrizzle } from "./infraestrutura/repositorio-exportacao-drizzle";
