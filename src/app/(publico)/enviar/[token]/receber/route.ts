import {
  EnvioRecusado, receberEnvio, resolverEnvio, TAMANHO_MAXIMO_ENVIO_BYTES, temFormatoDeToken, TokenDeCapturaInvalido,
  type ArquivoEnviado,
} from "@/modulos/captura-documentos/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";
import { capturaDisponivelNesteAmbiente } from "@/composicao/arquivos";
import { montarDependenciasEnvio } from "@/composicao/captura";

const logs = criarRegistradorLogs("captura-publica");

/** `303 See Other` com Location relativo: funciona atras de qualquer proxy e sem JavaScript. */
function irPara(caminho: string): Response {
  return new Response(null, { status: 303, headers: { Location: caminho } });
}

function naoVale(): Response {
  return new Response("Este QR code não vale mais.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * IP de quem enviou, SO do cabecalho que o proxy confiavel escreve.
 *
 * Em producao a aplicacao nao publica porta: tudo passa pelo Caddy, que
 * descarta `X-Forwarded-For` vindo de fora e escreve o endereco real. Na
 * Vercel, a plataforma faz o mesmo. Por isso o primeiro valor e o do cliente.
 * O IP nao e gravado em claro em lugar nenhum: vira HMAC no caso de uso.
 */
function ipDoRemetente(cabecalhos: Headers): string | null {
  const encaminhado = cabecalhos.get("x-forwarded-for");
  return encaminhado?.split(",")[0]?.trim() || null;
}

/**
 * Recebe o envio da pagina publica.
 *
 * E um Route Handler, e nao uma acao de servidor, porque acao tem teto de
 * 1 MB de corpo. A ORDEM importa (ADR-033): token conferido ANTES de ler o
 * corpo — quem nao passou na porta nao gasta disco nem memoria.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!temFormatoDeToken(token)) return naoVale();
  if (!capturaDisponivelNesteAmbiente()) return irPara(`/enviar/${token}`);

  const dependencias = montarDependenciasEnvio();
  try {
    await resolverEnvio(dependencias, token);
  } catch (erro) {
    if (erro instanceof TokenDeCapturaInvalido) return naoVale();
    throw erro;
  }

  /*
   * Tamanho conferido pelo cabecalho ANTES de ler o corpo: um envio acima do
   * limite e recusado sem gastar memoria com ele. A folga cobre os cabecalhos
   * do multipart. O Caddy corta antes ainda (413), mas a demonstracao na
   * Vercel nao tem Caddy na frente — por isso a conferencia vive aqui tambem.
   */
  const tamanhoDeclarado = Number(request.headers.get("content-length") ?? "0");
  if (tamanhoDeclarado > TAMANHO_MAXIMO_ENVIO_BYTES + 64 * 1024) {
    return irPara(`/enviar/${token}?erro=envio_grande`);
  }

  // So agora o corpo e lido.
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return irPara(`/enviar/${token}?erro=falha`);
  }

  const arquivos: ArquivoEnviado[] = [];
  for (const campo of ["fotos", "arquivos"]) {
    for (const valor of formulario.getAll(campo)) {
      if (!(valor instanceof File) || valor.size === 0) continue;
      arquivos.push({ nomeOriginal: valor.name, tipoConteudo: valor.type, conteudo: new Uint8Array(await valor.arrayBuffer()) });
    }
  }
  const observacao = formulario.get("observacao");

  try {
    const { codigo } = await receberEnvio(dependencias, token, {
      arquivos,
      observacao: typeof observacao === "string" ? observacao : null,
      remetente: { ip: ipDoRemetente(request.headers), agenteUsuario: request.headers.get("user-agent") },
    });
    return irPara(`/enviar/${token}/recebido?protocolo=${codigo}`);
  } catch (erro) {
    if (erro instanceof EnvioRecusado) return irPara(`/enviar/${token}?erro=${erro.motivo}`);
    if (erro instanceof TokenDeCapturaInvalido) return naoVale();
    logs.erro("falha ao receber envio publico", { erro });
    return irPara(`/enviar/${token}?erro=falha`);
  }
}
