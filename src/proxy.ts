import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (o antigo "middleware" do Next.js). Faz UMA coisa: repassa a rota
 * pedida em um cabecalho interno para que layouts e paginas — que nao recebem
 * a URL — saibam para onde devolver o usuario depois de entrar.
 *
 * Nao decide acesso: nenhuma leitura de cookie ou de sessao acontece aqui.
 * Quem decide e `exigirContextoAplicacao()`, no servidor, com o banco.
 */
export const CABECALHO_ROTA_ATUAL = "x-rota-atual";

export function proxy(requisicao: NextRequest) {
  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set(CABECALHO_ROTA_ATUAL, `${requisicao.nextUrl.pathname}${requisicao.nextUrl.search}`);
  return NextResponse.next({ request: { headers: cabecalhos } });
}

export const config = {
  // Tudo, exceto arquivos estaticos e as rotas do Next.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|txt|woff2?)$).*)"],
};
