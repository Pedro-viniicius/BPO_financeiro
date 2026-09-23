/**
 * Interface publica do modulo "exportacao".
 * Leva os dados da empresa embora, em CSV, num ZIP so.
 */
export { CONJUNTOS, type ConjuntoExportado } from "./dominio/conjunto-de-dados";
export type { PacoteExportado, RepositorioExportacao } from "./aplicacao/repositorio-exportacao";
export { RepositorioExportacaoDrizzle } from "./infraestrutura/repositorio-exportacao-drizzle";
