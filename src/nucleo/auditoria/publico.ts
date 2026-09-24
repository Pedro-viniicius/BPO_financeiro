/** Interface publica do modulo de auditoria financeira (somente insercao). */
export { ACOES_AUDITORIA, type AcaoAuditoria, type EventoAuditoria, type OrigemAcao } from "./dominio/evento-auditoria";
export { RegistradorAuditoriaEmMemoria, type RegistradorAuditoria } from "./aplicacao/registrador-auditoria";
export { RegistradorAuditoriaDrizzle } from "./infraestrutura/registrador-auditoria-drizzle";
export { anonimizarIp, ehDaGeracaoAtual, GERACAO_SAL_IP } from "./dominio/ip-anonimo";
