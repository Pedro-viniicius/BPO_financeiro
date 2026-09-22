import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";

import { falha, type Resultado, sucesso } from "@/compartilhado/erros/resultado";
import { comoIdentificador, type IdUsuario } from "@/compartilhado/tipos/identificadores";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";

import {
  CadastroFechado,
  CodigoSegundoFatorInvalido,
  CredenciaisInvalidas,
  DesafioSegundoFatorExpirado,
  EmailJaCadastrado,
  FalhaAoEnviarEmail,
  MuitasTentativas,
  TokenRedefinicaoInvalido,
} from "../dominio/erros";
import { obterAutenticacao } from "../infraestrutura/better-auth";

/**
 * Operacoes de sessao chamadas por server actions.
 *
 * Traduzem o Better Auth para o vocabulario do sistema: nenhum erro cru da
 * biblioteca (nem do banco) sai daqui. Quem decide para onde ir depois e a
 * rota que chamou — este modulo nao conhece empresas.
 *
 * Entrar e criar conta passam pelo `handler` HTTP da biblioteca, e nao por
 * `api.signInEmail`: so o handler aplica o limite de tentativas (5/min por
 * IP) e a verificacao de Origin. A requisicao e reconstruida com os mesmos
 * cabecalhos do navegador (IP, Origin, User-Agent) e os cookies da resposta
 * sao copiados para a resposta da server action.
 *
 * `headers()` e lido antes de `obterAutenticacao()` de proposito (ver
 * `obter-sessao-atual.ts`): marca a rota como dinamica.
 */

export interface CredenciaisEntrada {
  readonly email: string;
  readonly senha: string;
}

/**
 * O que aconteceu ao entrar com e-mail e senha.
 *
 * `segundo_fator` NAO e falha: a senha estava certa, mas a conta exige o
 * codigo TOTP. O Better Auth ja gravou o cookie do desafio; falta a tela
 * `/verificacao-duas-etapas` confirmar o codigo para a sessao ser criada.
 */
export type ResultadoEntrada =
  | { readonly tipo: "autenticado"; readonly usuarioId: IdUsuario }
  | { readonly tipo: "segundo_fator" };

export interface DadosNovaConta extends CredenciaisEntrada {
  readonly nome: string;
}

interface RespostaAutenticacao {
  readonly status: number;
  readonly corpo: { readonly code?: string; readonly message?: string; readonly user?: { readonly id: string }; readonly twoFactorRedirect?: boolean };
  readonly retryAfterSegundos: number | undefined;
}

export async function entrarComEmail(
  credenciais: CredenciaisEntrada,
): Promise<Resultado<ResultadoEntrada, CredenciaisInvalidas | MuitasTentativas>> {
  const resposta = await chamarEndpoint("/sign-in/email", { email: credenciais.email, password: credenciais.senha });

  if (resposta.status === 429) return falha(new MuitasTentativas(resposta.retryAfterSegundos));

  // Conta com segundo fator: a resposta traz `twoFactorRedirect` e NAO traz
  // `user`, porque a sessao so nasce depois do codigo. Precisa vir antes da
  // checagem de `user`, senao viraria "credenciais invalidas".
  if (resposta.corpo.twoFactorRedirect) return sucesso({ tipo: "segundo_fator" });

  if (resposta.status !== 200 || !resposta.corpo.user) {
    // 401 (senha errada), 403 (e-mail nao verificado) e 404 (e-mail inexistente)
    // recebem a MESMA resposta: a tela nao confirma se um cadastro existe.
    return falha(new CredenciaisInvalidas());
  }
  return sucesso({ tipo: "autenticado", usuarioId: comoIdentificador<"Usuario">(resposta.corpo.user.id) });
}

/**
 * Confirma o codigo TOTP do desafio pendente e cria a sessao.
 * O desafio vem do cookie gravado por `entrarComEmail`; se ele expirou ou nao
 * existe, o Better Auth recusa e a tela manda a pessoa entrar de novo.
 */
export async function verificarSegundoFator(codigo: string): Promise<Resultado<{ usuarioId: IdUsuario | null }, CodigoSegundoFatorInvalido | DesafioSegundoFatorExpirado | MuitasTentativas>> {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length === 0) return falha(new CodigoSegundoFatorInvalido());

  const resposta = await chamarEndpoint("/two-factor/verify-totp", { code: limpo });

  if (resposta.status === 429) return falha(new MuitasTentativas(resposta.retryAfterSegundos));
  // Sem cookie de desafio (expirou, foi limpo, ou a pessoa abriu a tela direto).
  if (resposta.status === 400 || resposta.corpo.code === "INVALID_TWO_FACTOR_COOKIE") {
    return falha(new DesafioSegundoFatorExpirado());
  }
  if (resposta.status !== 200) return falha(new CodigoSegundoFatorInvalido());
  return sucesso({ usuarioId: resposta.corpo.user ? comoIdentificador<"Usuario">(resposta.corpo.user.id) : null });
}

export async function criarContaComEmail(
  dados: DadosNovaConta,
): Promise<Resultado<{ usuarioId: IdUsuario }, CadastroFechado | EmailJaCadastrado | MuitasTentativas>> {
  const resposta = await chamarEndpoint("/sign-up/email", { name: dados.nome, email: dados.email, password: dados.senha });

  if (resposta.status === 429) return falha(new MuitasTentativas(resposta.retryAfterSegundos));
  if (resposta.corpo.code === "CADASTRO_FECHADO") return falha(new CadastroFechado());
  if (resposta.status === 422 || resposta.corpo.code === "USER_ALREADY_EXISTS") return falha(new EmailJaCadastrado());
  if (resposta.status !== 200 || !resposta.corpo.user) {
    // Qualquer outra recusa e inesperada (a senha ja foi validada antes): sobe para o log, sem detalhes ao usuario.
    throw new Error(`Better Auth recusou o cadastro: ${resposta.status} ${resposta.corpo.code ?? ""}`.trim());
  }
  return sucesso({ usuarioId: comoIdentificador<"Usuario">(resposta.corpo.user.id) });
}

/**
 * Pede o e-mail de redefinicao de senha.
 *
 * Devolve sempre sucesso, de proposito: responder "esse e-mail nao existe"
 * transformaria a tela em um verificador de cadastro. A tela mostra o mesmo
 * texto para todos. Uma falha tecnica (provedor fora) e registrada no log e
 * sobe como falha — ai o usuario precisa saber que nao adianta esperar.
 */
export async function pedirRedefinicaoDeSenha(email: string): Promise<Resultado<void, FalhaAoEnviarEmail>> {
  const resposta = await chamarEndpoint("/request-password-reset", { email });

  // 200 (enviado) e 404/400 (e-mail desconhecido) sao a MESMA resposta aqui.
  if (resposta.status === 200 || resposta.status === 404 || resposta.status === 400) return sucesso(undefined);
  if (resposta.status === 429) return sucesso(undefined);
  return falha(new FalhaAoEnviarEmail());
}

/** Troca a senha usando o token recebido por e-mail. */
export async function redefinirSenha(token: string, novaSenha: string): Promise<Resultado<void, TokenRedefinicaoInvalido>> {
  const resposta = await chamarEndpoint("/reset-password", { token, newPassword: novaSenha });
  if (resposta.status !== 200) return falha(new TokenRedefinicaoInvalido());
  return sucesso(undefined);
}

/** Encerra a sessao atual (revoga no banco e limpa o cookie). Nunca falha para o usuario. */
export async function sairDaSessao(): Promise<void> {
  const cabecalhos = await headers();
  try {
    await obterAutenticacao().api.signOut({ headers: cabecalhos });
  } catch (erro) {
    // Sessao ja invalida: o resultado desejado (estar fora) ja vale.
    if (!(erro instanceof APIError)) throw erro;
  }
}

/** Chama um endpoint do Better Auth como se fosse a requisicao HTTP original. */
async function chamarEndpoint(caminho: string, corpo: Record<string, string>): Promise<RespostaAutenticacao> {
  const cabecalhosOriginais = await headers();
  const variaveis = obterVariaveisAmbiente();

  const cabecalhos = new Headers();
  for (const nome of ["cookie", "origin", "referer", "user-agent", "x-forwarded-for", "x-real-ip", "x-request-id"]) {
    const valor = cabecalhosOriginais.get(nome);
    if (valor) cabecalhos.set(nome, valor);
  }
  cabecalhos.set("content-type", "application/json");
  cabecalhos.set("accept", "application/json");

  const requisicao = new Request(`${variaveis.APLICACAO_URL}/api/autenticacao${caminho}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
  const resposta = await obterAutenticacao().handler(requisicao);
  await aplicarCookiesDaResposta(resposta);

  let corpoResposta: RespostaAutenticacao["corpo"] = {};
  try {
    corpoResposta = (await resposta.json()) as RespostaAutenticacao["corpo"];
  } catch {
    // Sem corpo JSON (ex.: 429 sem conteudo): o status basta.
  }
  const retryAfter = Number(resposta.headers.get("Retry-After") ?? resposta.headers.get("X-Retry-After"));
  return { status: resposta.status, corpo: corpoResposta, retryAfterSegundos: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined };
}

/**
 * Copia os `Set-Cookie` da resposta do Better Auth para a resposta da server
 * action. So os atributos que a biblioteca usa sao interpretados.
 */
async function aplicarCookiesDaResposta(resposta: Response): Promise<void> {
  const armazem = await cookies();
  for (const linha of resposta.headers.getSetCookie()) {
    const [par, ...atributos] = linha.split(";");
    const separador = par?.indexOf("=") ?? -1;
    if (!par || separador <= 0) continue;
    const nome = par.slice(0, separador).trim();
    const valor = decodeURIComponent(par.slice(separador + 1).trim());
    const opcoes: Parameters<typeof armazem.set>[2] = { path: "/" };
    for (const atributo of atributos) {
      const [chave, ...resto] = atributo.trim().split("=");
      const conteudo = resto.join("=");
      switch (chave?.toLowerCase()) {
        case "max-age":
          opcoes.maxAge = Number(conteudo);
          break;
        case "expires":
          opcoes.expires = new Date(conteudo);
          break;
        case "path":
          opcoes.path = conteudo;
          break;
        case "httponly":
          opcoes.httpOnly = true;
          break;
        case "secure":
          opcoes.secure = true;
          break;
        case "samesite":
          opcoes.sameSite = conteudo.toLowerCase() as "lax" | "strict" | "none";
          break;
        default:
          break;
      }
    }
    armazem.set(nome, valor, opcoes);
  }
}
