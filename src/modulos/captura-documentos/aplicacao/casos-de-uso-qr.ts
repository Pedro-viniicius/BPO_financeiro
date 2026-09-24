import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import { limiteDeEnviosValido } from "../dominio/limite-tentativas";
import { gerarTokenDeCaptura, hashDoTokenDeCaptura, linkDeEnvio } from "../dominio/token-captura";
import type { RepositorioCaptura, TokenDeCapturaAtivo } from "./repositorio-captura";

export interface DependenciasQr {
  readonly repositorio: RepositorioCaptura;
  /** `APLICACAO_URL`: a base da URL que o QR codifica. */
  readonly aplicacaoUrl: string;
}

export interface QrGerado {
  /** O token em claro. Aparece UMA vez: o banco guarda so o hash. */
  readonly token: string;
  readonly link: string;
  readonly substituiuAnterior: boolean;
}

/**
 * Gera o QR da empresa. Se ja havia um, ele morre na mesma transacao.
 *
 * O token volta em claro para a tela montar o QR e o link — e nunca mais e
 * recuperavel. Para "reimprimir" gera-se outro, e o impresso anterior deixa
 * de valer. E consequencia direta de guardar so o hash, e e o comportamento
 * desejado: nao existe QR antigo circulando que o sistema nao consiga matar.
 */
export async function gerarQrDeCaptura(
  dependencias: DependenciasQr,
  escopo: EscopoEmpresa,
  autorUsuarioId: string,
): Promise<QrGerado> {
  const token = gerarTokenDeCaptura();
  const { substituiuAnterior } = await dependencias.repositorio.gerarToken(escopo, {
    tokenHash: hashDoTokenDeCaptura(token),
    autorUsuarioId,
  });
  return { token, link: linkDeEnvio(dependencias.aplicacaoUrl, token), substituiuAnterior };
}

/** Verdadeiro se havia QR ativo. Depois disto, quem escanear o impresso ve "este QR não vale mais". */
export async function revogarQrDeCaptura(
  dependencias: DependenciasQr,
  escopo: EscopoEmpresa,
  autorUsuarioId: string,
): Promise<boolean> {
  return dependencias.repositorio.revogarToken(escopo, { autorUsuarioId });
}

export async function situacaoDoQr(dependencias: DependenciasQr, escopo: EscopoEmpresa): Promise<TokenDeCapturaAtivo | null> {
  return dependencias.repositorio.obterTokenAtivo(escopo);
}

/** Falso se o limite e invalido ou se nao ha token ativo para receber a configuracao. */
export async function definirLimiteDeEnvios(
  dependencias: DependenciasQr,
  escopo: EscopoEmpresa,
  limite: number,
  autorUsuarioId: string,
): Promise<boolean> {
  if (!limiteDeEnviosValido(limite)) return false;
  return dependencias.repositorio.definirLimiteDeEnvios(escopo, { limite, autorUsuarioId });
}
