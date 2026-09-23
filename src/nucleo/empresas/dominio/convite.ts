import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * O token de um convite.
 *
 * O sistema nunca cria senha para ninguem: o convite e um LINK de uso unico,
 * e quem entra define a propria senha. Enviar senha por e-mail, ou mostra-la
 * na tela para alguem copiar, deixaria a senha em caixa de entrada e em
 * historico de conversa para sempre.
 *
 * O BANCO GUARDA SO O HASH. Assim um vazamento do banco nao da acesso a
 * ninguem — quem tem o link continua sendo so quem o recebeu. E a mesma razao
 * de nunca guardar senha em claro.
 */

/** 48 horas: tempo de sobra para alguem ver o e-mail, e curto para um link vazado. */
export const PRAZO_DO_CONVITE_HORAS = 48;

export class ConviteInvalido extends ErroDominio {
  readonly codigo = "convite_invalido";
  readonly categoria: CategoriaErro = "nao_encontrado";

  constructor(motivo: "inexistente" | "expirado" | "usado" | "cancelado") {
    super(
      {
        inexistente: "Este convite não existe. Peça um novo link a quem administra o sistema.",
        expirado: "Este convite expirou. Peça um novo link a quem administra o sistema.",
        usado: "Este convite já foi usado. Se precisa entrar de novo, use “Esqueci minha senha”.",
        cancelado: "Este convite foi cancelado. Peça um novo link a quem administra o sistema.",
      }[motivo],
    );
  }
}

/**
 * 32 bytes aleatorios em base64url.
 *
 * `randomBytes` e criptografico; `Math.random` nao e, e um token adivinhavel
 * aqui vale por uma senha.
 */
export function gerarTokenDeConvite(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 em hexadecimal. E o que vai para o banco. */
export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Compara dois hashes em tempo constante.
 *
 * A busca no banco e por igualdade de hash, entao esta funcao serve a quem
 * comparar em memoria: comparar com `===` vaza, pelo tempo de resposta,
 * quantos caracteres iniciais batem.
 */
export function hashesIguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function expiracaoDoConvite(agora: Date): Date {
  return new Date(agora.getTime() + PRAZO_DO_CONVITE_HORAS * 60 * 60 * 1000);
}

export interface ConviteParaValidar {
  readonly expiraEm: Date;
  readonly aceitoEm: Date | null;
  readonly canceladoEm: Date | null;
}

/** Lanca `ConviteInvalido` explicando qual das quatro situacoes ocorreu. */
export function exigirConviteUtilizavel(convite: ConviteParaValidar | null, agora: Date): void {
  if (!convite) throw new ConviteInvalido("inexistente");
  if (convite.canceladoEm) throw new ConviteInvalido("cancelado");
  if (convite.aceitoEm) throw new ConviteInvalido("usado");
  if (convite.expiraEm.getTime() <= agora.getTime()) throw new ConviteInvalido("expirado");
}

/** O link completo que a pessoa recebe. */
export function linkDoConvite(aplicacaoUrl: string, token: string): string {
  return `${aplicacaoUrl.replace(/\/$/, "")}/convite/${token}`;
}
