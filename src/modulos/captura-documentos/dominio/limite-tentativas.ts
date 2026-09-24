import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Limite de tentativas da pagina publica (ADR-031), em Postgres — nao ha Redis.
 *
 * Dois limites, porque protegem de coisas diferentes:
 * - por TOKEN, so em envios validos: uso legitimo exagerado ou QR vazado.
 *   Configuravel por empresa (`tokens_captura.limite_envios_hora`, padrao 20);
 * - por IP, so em tentativas com token INVALIDO: varredura. Fixo em 10 por
 *   hora. Envio valido nao e limitado por IP de proposito: CGNAT faz muita
 *   gente legitima dividir o mesmo endereco, e limitar puniria quem esta certo.
 *
 * A janela e a hora cheia (13:00, 14:00...). Uma linha por (identificador,
 * janela); cada tentativa e um INSERT ... ON CONFLICT DO UPDATE que devolve o
 * contador. O identificador nunca e o IP em claro: e o HMAC (ou o hash do
 * token), com um prefixo que separa os dois espacos.
 */
export const LIMITE_TOKENS_INVALIDOS_POR_IP_HORA = 10;
export const LIMITE_ENVIOS_HORA_PADRAO = 20;
export const LIMITE_ENVIOS_HORA_MAXIMO = 500;

/** Inicio da janela de uma hora que contem `agora`. */
export function janelaDe(agora: Date): Date {
  const janela = new Date(agora);
  janela.setUTCMinutes(0, 0, 0);
  return janela;
}

export function identificadorDoToken(tokenHash: string): string {
  return `token:${tokenHash}`;
}

export function identificadorDoIp(ipAnonimo: string): string {
  return `ip:${ipAnonimo}`;
}

export class LimiteDeTentativasExcedido extends ErroDominio {
  readonly codigo = "limite_tentativas_excedido";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(readonly alvo: "token" | "ip") {
    super(
      alvo === "token"
        ? "Muitos envios na última hora para esta empresa. Aguarde um pouco e tente de novo."
        : "Muitas tentativas. Aguarde um pouco e tente de novo.",
    );
  }
}

export function limiteDeEnviosValido(limite: number): boolean {
  return Number.isInteger(limite) && limite >= 1 && limite <= LIMITE_ENVIOS_HORA_MAXIMO;
}
