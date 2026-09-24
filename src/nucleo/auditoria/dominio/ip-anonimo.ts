import { createHmac } from "node:crypto";

/**
 * Anonimiza um endereco IP para a trilha de auditoria e para o limite de
 * tentativas da captura publica (Gate 10).
 *
 * E HMAC-SHA-256 com o sal como chave — nao `sha256(sal + ip)`. HMAC e a
 * construcao feita para "hash com segredo"; a concatenacao ingenua tem
 * armadilhas conhecidas de extensao de comprimento.
 *
 * O resultado leva PREFIXO DE GERACAO ("v1:"). Se um dia o sal mudar, os
 * registros passam a nascer "v2:" e fica evidente, na propria coluna, onde a
 * comparacao para de valer — em vez de silenciosamente errado. Trocar o sal
 * nunca e rotina: e resposta a comprometimento.
 *
 * Sem sal, devolve `null`: o IP simplesmente nao e registrado. Em nenhuma
 * hipotese ele e gravado em claro por falta de configuracao.
 */
export const GERACAO_SAL_IP = "v1";

export function anonimizarIp(ip: string | null | undefined, sal: string | undefined): string | null {
  if (!sal) return null;
  const limpo = ip?.trim();
  if (!limpo) return null;
  return `${GERACAO_SAL_IP}:${createHmac("sha256", sal).update(limpo, "utf8").digest("hex")}`;
}

/** Diz se um valor gravado veio da geracao atual do sal (comparavel com o que se gera hoje). */
export function ehDaGeracaoAtual(valorGravado: string): boolean {
  return valorGravado.startsWith(`${GERACAO_SAL_IP}:`);
}
