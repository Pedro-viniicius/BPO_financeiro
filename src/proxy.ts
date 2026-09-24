import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (o antigo "middleware" do Next.js). Faz DUAS coisas, ambas sem
 * decidir acesso:
 *
 * 1. Repassa a rota pedida em um cabecalho interno para que layouts e paginas
 *    — que nao recebem a URL — saibam para onde devolver o usuario depois de
 *    entrar.
 * 2. Gera um `nonce` por requisicao e escreve a `Content-Security-Policy`
 *    (CSP) na requisicao e na resposta. O Next.js le o nonce do cabecalho da
 *    requisicao e o aplica aos scripts que ele mesmo injeta; um script que
 *    chegue por outro caminho nao tem o nonce e o navegador o recusa. E a
 *    segunda linha atras do escape do React — que ate aqui era a unica.
 *
 * Nao decide acesso: nenhuma leitura de cookie ou de sessao acontece aqui.
 * Quem decide e `exigirContextoAplicacao()`, no servidor, com o banco.
 */
export const CABECALHO_ROTA_ATUAL = "x-rota-atual";
export const CABECALHO_NONCE = "x-nonce";

/**
 * A politica, dado o nonce desta requisicao.
 *
 * - `script-src` com nonce e `'strict-dynamic'`: so os scripts do Next (que
 *   recebem o nonce) e o que eles carregarem. Em desenvolvimento o React usa
 *   `eval` para reconstruir pilhas de erro do servidor no navegador, dai o
 *   `'unsafe-eval'` so nesse modo.
 * - `style-src 'unsafe-inline'`: atributos `style=` (indicadores, graficos de
 *   barras, a tela de erro global) nao aceitam nonce por definicao da CSP.
 *   Estilo inline nao executa codigo; o risco que a CSP mira e script.
 * - `frame-ancestors 'none'`: ninguem embute o sistema num iframe (o
 *   `X-Frame-Options: DENY` do next.config.ts diz o mesmo para navegadores antigos).
 * - `form-action 'self'` e `base-uri 'self'`: formulario e `<base>` nao
 *   apontam para fora.
 * - `upgrade-insecure-requests` so fora de desenvolvimento, onde o site e
 *   servido por HTTPS; em `http://localhost` ele quebraria os recursos.
 */
export function politicaDeSeguranca(nonce: string, desenvolvimento = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${desenvolvimento ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(desenvolvimento ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(requisicao: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const politica = politicaDeSeguranca(nonce);

  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set(CABECALHO_ROTA_ATUAL, `${requisicao.nextUrl.pathname}${requisicao.nextUrl.search}`);
  cabecalhos.set(CABECALHO_NONCE, nonce);
  // E deste cabecalho DA REQUISICAO que o Next.js extrai o nonce ao renderizar.
  cabecalhos.set("Content-Security-Policy", politica);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set("Content-Security-Policy", politica);
  return resposta;
}

export const config = {
  /*
   * Tudo, exceto arquivos estaticos, as rotas do Next e o RECEBIMENTO do envio
   * publico (`POST /enviar/<token>/receber`). Este ultimo fica de fora porque
   * uma requisicao que passa pelo proxy tem o corpo limitado a 10 MB pelo
   * Next — uma foto de celular passa disso. Fora do proxy, o corpo vai direto
   * ao Route Handler, que confere o tamanho pelos bytes que chegam. A rota nao
   * devolve HTML (so redireciona), entao a CSP dela e a estatica do
   * next.config.ts.
   *
   * As PAGINAS de /enviar (o formulario e a confirmacao) passam pelo proxy:
   * elas tem scripts (compressao das fotos, leitura da chave) e precisam do
   * nonce como qualquer outra tela.
   */
  matcher: ["/((?!_next/|favicon.ico|enviar/[^/]+/receber$|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|txt|woff2?)$).*)"],
};
