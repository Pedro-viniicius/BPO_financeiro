import { comCorpoLimitado, ehCorpoAcimaDoLimite } from "@/compartilhado/http/corpo-limitado";
import {
  autorizarEnvio, EnvioRecusado, LimiteDeTentativasExcedido, receberEnvio, TAMANHO_MAXIMO_ENVIO_BYTES,
  TokenDeCapturaInvalido, type ArquivoEnviado, type EscopoResolvidoPorToken,
} from "@/modulos/captura-documentos/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";
import { capturaDisponivelNesteAmbiente } from "@/composicao/arquivos";
import { montarDependenciasEnvio } from "@/composicao/captura";

const logs = criarRegistradorLogs("captura-publica");

/** `303 See Other` com Location relativo: funciona atras de qualquer proxy e sem JavaScript. */
function irPara(caminho: string): Response {
  return new Response(null, { status: 303, headers: { Location: caminho } });
}

/** 429 seco, sem numeros: o limite por IP so vale para quem insiste com token invalido (ADR-031). */
function muitasTentativas(mensagem: string): Response {
  return new Response(mensagem, { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600" } });
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
  if (!capturaDisponivelNesteAmbiente()) return irPara(`/enviar/${token}`);

  const dependencias = montarDependenciasEnvio();
  const ip = ipDoRemetente(request.headers);
  let autorizado: EscopoResolvidoPorToken;
  try {
    autorizado = await autorizarEnvio(dependencias, token, ip);
  } catch (erro) {
    if (erro instanceof TokenDeCapturaInvalido) return naoVale();
    if (erro instanceof LimiteDeTentativasExcedido) {
      return erro.alvo === "token" ? irPara(`/enviar/${token}?erro=limite_excedido`) : muitasTentativas(erro.message);
    }
    throw erro;
  }

  /*
   * Tamanho conferido em DUAS camadas, ambas antes de gastar memoria:
   *
   * 1. pelo `Content-Length` declarado — barato, recusa sem ler nada;
   * 2. pelos BYTES QUE CHEGAM (`comCorpoLimitado`) — porque o cabecalho e
   *    promessa de quem envia, e uma transferencia em pedacos (`chunked`)
   *    nem o traz. Sem esta camada, `formData()` leria um corpo de qualquer
   *    tamanho para a memoria antes de a conferencia acima ter efeito.
   *
   * A folga cobre os cabecalhos do multipart. O Caddy corta antes ainda (413)
   * no Modelo A; nos Modelos B/C o proxy e do operador, e a demonstracao na
   * Vercel nao tem proxy nenhum — por isso as duas camadas vivem aqui tambem.
   */
  const TETO_DO_CORPO = TAMANHO_MAXIMO_ENVIO_BYTES + 64 * 1024;
  const tamanhoDeclarado = Number(request.headers.get("content-length") ?? "0");
  if (tamanhoDeclarado > TETO_DO_CORPO) {
    return irPara(`/enviar/${token}?erro=envio_grande`);
  }

  // So agora o corpo e lido — e interrompido no primeiro byte alem do teto.
  let formulario: FormData;
  try {
    formulario = await comCorpoLimitado(request, TETO_DO_CORPO).formData();
  } catch (erro) {
    if (ehCorpoAcimaDoLimite(erro)) return irPara(`/enviar/${token}?erro=envio_grande`);
    return irPara(`/enviar/${token}?erro=falha`);
  }

  const arquivos: ArquivoEnviado[] = [];
  for (const campo of ["fotos", "arquivos"]) {
    for (const valor of formulario.getAll(campo)) {
      if (!(valor instanceof File) || valor.size === 0) continue;
      // `valor.type` e o que o cliente DECLAROU; nao entra: o tipo vem do conteudo (ADR-032).
      arquivos.push({ nomeOriginal: valor.name, conteudo: new Uint8Array(await valor.arrayBuffer()) });
    }
  }
  const observacao = formulario.get("observacao");
  const chaveAcesso = formulario.get("chaveAcesso");

  try {
    const { codigo } = await receberEnvio(dependencias, autorizado, {
      arquivos,
      observacao: typeof observacao === "string" ? observacao : null,
      chaveAcesso: typeof chaveAcesso === "string" ? chaveAcesso : null,
      remetente: { ip, agenteUsuario: request.headers.get("user-agent") },
    });
    return irPara(`/enviar/${token}/recebido?protocolo=${codigo}`);
  } catch (erro) {
    if (erro instanceof EnvioRecusado) return irPara(`/enviar/${token}?erro=${erro.motivo}`);
    if (erro instanceof TokenDeCapturaInvalido) return naoVale();
    logs.erro("falha ao receber envio publico", { erro });
    return irPara(`/enviar/${token}?erro=falha`);
  }
}
