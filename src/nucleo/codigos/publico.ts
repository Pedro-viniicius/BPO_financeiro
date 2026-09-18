/** Interface publica: geracao de codigos legiveis por humanos (CP-2026-000123). */
export { PREFIXOS_CODIGO, formatarCodigo, type GeradorCodigo, type PrefixoCodigo } from "./aplicacao/gerador-codigo";
export { GeradorCodigoPostgres } from "./infraestrutura/gerador-codigo-postgres";
