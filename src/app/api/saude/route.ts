import { verificarConexaoBanco } from "@/nucleo/banco-dados/publico";

export const dynamic = "force-dynamic";

/**
 * Verificacao de saude ("health check") usada por Docker, proxies e monitoramento.
 * Responde 200 quando a aplicacao e o banco estao acessiveis; 503 caso contrario.
 * Nao expoe detalhes internos.
 */
export async function GET(): Promise<Response> {
  const bancoOk = await verificarConexaoBanco();
  if (!bancoOk) {
    return Response.json({ situacao: "indisponivel", banco: "falha" }, { status: 503 });
  }
  return Response.json({ situacao: "ok", banco: "ok" });
}
