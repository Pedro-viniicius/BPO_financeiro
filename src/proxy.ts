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
  /*
   * Tudo, exceto arquivos estaticos, as rotas do Next e a pagina publica de
   * envio (`/enviar/...`). Esta ultima fica de fora por dois motivos: nao ha
   * sessao la, entao o cabecalho de rota nao serve a ninguem; e uma
   * requisicao que passa pelo proxy tem o corpo limitado a 10 MB pelo Next —
   * uma foto de celular passa disso. Fora do proxy, o corpo vai direto ao
   * Route Handler, que confere o tamanho antes de ler.
   */
  matcher: ["/((?!_next/|favicon.ico|enviar/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|txt|woff2?)$).*)"],
};
