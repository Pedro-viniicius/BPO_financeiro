import { createHash } from "node:crypto";

import { hojeDataCivil } from "@/compartilhado/datas/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";
import { detectarTipoPorConteudo, type ArmazenamentoArquivos } from "@/nucleo/arquivos/publico";
import { anonimizarIp } from "@/nucleo/auditoria/publico";

import { EnvioRecusado, validarEnvio } from "../dominio/envio";
import {
  identificadorDoIp, identificadorDoToken, janelaDe, LIMITE_TOKENS_INVALIDOS_POR_IP_HORA, LimiteDeTentativasExcedido,
} from "../dominio/limite-tentativas";
import { hashDoTokenDeCaptura, temFormatoDeToken } from "../dominio/token-captura";
import type { ArquivoDoEnvio, EscopoResolvidoPorToken, RepositorioCaptura } from "./repositorio-captura";

/** Fuso das datas de negocio do sistema (invariante 4). O ano do protocolo e o ano civil daqui. */
const FUSO = "America/Sao_Paulo";

export interface DependenciasEnvio {
  readonly repositorio: RepositorioCaptura;
  /** Armazenamento com namespace da empresa (composicao decide a implementacao). */
  readonly armazenamentoDe: (empresaId: string) => ArmazenamentoArquivos;
  /** `AUDITORIA_SAL_IP`; sem ele o IP nao e registrado nem limitado. */
  readonly salDoIp: string | undefined;
  /** Relogio injetavel (testes de janela). */
  readonly agora?: () => Date;
}

/** O que chega do formulario. Nao ha tipo declarado aqui de proposito: o tipo e decidido pelo conteudo. */
export interface ArquivoEnviado {
  readonly nomeOriginal: string;
  readonly conteudo: Uint8Array;
}

export interface Envio {
  readonly arquivos: readonly ArquivoEnviado[];
  readonly observacao: string | null;
  readonly remetente: { readonly ip: string | null; readonly agenteUsuario: string | null };
}

/**
 * Uma so mensagem para "nao existe" e "foi revogado": quem escaneou nao tem
 * como saber a diferenca, e dizer "revogado" confirmaria que aquele token
 * existiu. A trilha de quem revogou esta na auditoria, para quem tem acesso.
 */
export class TokenDeCapturaInvalido extends ErroDominio {
  readonly codigo = "token_captura_invalido";
  readonly categoria: CategoriaErro = "nao_encontrado";

  constructor() {
    super("Este QR code não vale mais. Peça o atual a quem cuida do financeiro da empresa.");
  }
}

/**
 * Conta uma tentativa com token INVALIDO para o IP (ADR-031). Sem sal nao ha
 * IP anonimizado, e sem IP anonimizado nao ha limite por IP: nunca se conta
 * pelo endereco em claro.
 */
async function contarTokenInvalido(dependencias: DependenciasEnvio, ip: string | null): Promise<void> {
  const anonimo = anonimizarIp(ip, dependencias.salDoIp);
  if (!anonimo) return;
  const agora = dependencias.agora?.() ?? new Date();
  const total = await dependencias.repositorio.registrarTentativa(identificadorDoIp(anonimo), janelaDe(agora));
  if (total > LIMITE_TOKENS_INVALIDOS_POR_IP_HORA) throw new LimiteDeTentativasExcedido("ip");
}

/**
 * Troca o token da URL pelo escopo da empresa — ANTES de ler qualquer corpo.
 * E o unico ponto do sistema que fabrica um `EscopoEmpresa` sem sessao
 * (ADR-033). Formato errado nem chega ao banco, mas conta como tentativa
 * invalida para o IP, como qualquer token que nao resolve.
 */
export async function resolverEnvio(
  dependencias: DependenciasEnvio,
  token: string,
  ip: string | null,
): Promise<EscopoResolvidoPorToken> {
  if (!temFormatoDeToken(token)) {
    await contarTokenInvalido(dependencias, ip);
    throw new TokenDeCapturaInvalido();
  }
  const resolvido = await dependencias.repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura(token));
  if (!resolvido) {
    await contarTokenInvalido(dependencias, ip);
    throw new TokenDeCapturaInvalido();
  }
  return resolvido;
}

/**
 * Autoriza um ENVIO (POST): resolve o token e conta a tentativa contra o
 * limite por hora da empresa. Tambem antes do corpo. Quem passou daqui pode
 * gastar disco.
 */
export async function autorizarEnvio(
  dependencias: DependenciasEnvio,
  token: string,
  ip: string | null,
): Promise<EscopoResolvidoPorToken> {
  const resolvido = await resolverEnvio(dependencias, token, ip);
  const agora = dependencias.agora?.() ?? new Date();
  const total = await dependencias.repositorio.registrarTentativa(
    identificadorDoToken(hashDoTokenDeCaptura(token)),
    janelaDe(agora),
  );
  if (total > resolvido.limiteEnviosHora) throw new LimiteDeTentativasExcedido("token");
  return resolvido;
}

/**
 * Recebe um envio ja autorizado: valida, guarda os arquivos e cria o
 * documento pendente.
 *
 * O TIPO de cada arquivo e decidido pelos primeiros bytes (ADR-032), nunca
 * pelo que o cliente declarou; o detectado e o que vai para o banco.
 *
 * Ordem deliberada: arquivos vao para o disco PRIMEIRO, banco por ultimo,
 * numa transacao unica. Se a conexao cair no meio, nada e gravado no banco;
 * se a transacao falhar depois do disco, sobra arquivo orfao — inofensivo, e
 * recolhido pela tarefa de limpeza. O contrario (banco antes do disco) daria
 * documento apontando para arquivo que nao existe.
 *
 * O mesmo conteudo (mesmo SHA-256) ja guardado pela empresa e reaproveitado:
 * reenviar por causa de conexao ruim nao duplica nada. Dentro de um mesmo
 * envio, o mesmo arquivo duas vezes conta uma.
 */
export async function receberEnvio(
  dependencias: DependenciasEnvio,
  autorizado: EscopoResolvidoPorToken,
  envio: Envio,
): Promise<{ readonly codigo: string }> {
  const { escopo, tokenId } = autorizado;

  const observacao = envio.observacao?.trim() || null;
  const tipados = envio.arquivos.map((arquivo) => {
    const tipoConteudo = detectarTipoPorConteudo(arquivo.conteudo);
    if (!tipoConteudo) throw new EnvioRecusado("tipo_nao_permitido");
    return { ...arquivo, tipoConteudo };
  });
  validarEnvio(
    tipados.map((arquivo) => ({ tamanhoBytes: arquivo.conteudo.byteLength, tipoConteudo: arquivo.tipoConteudo })),
    observacao,
  );

  const armazenamento = dependencias.armazenamentoDe(escopo.empresaId);
  const arquivos: ArquivoDoEnvio[] = [];
  const vistos = new Set<string>();
  for (const arquivo of tipados) {
    const impressaoDigital = createHash("sha256").update(arquivo.conteudo).digest("hex");
    if (vistos.has(impressaoDigital)) continue;
    vistos.add(impressaoDigital);

    const existente = await dependencias.repositorio.procurarArquivoPorImpressao(escopo, impressaoDigital);
    if (existente) {
      arquivos.push({ existenteId: existente.id });
      continue;
    }
    const guardado = await armazenamento.guardar({
      nomeOriginal: arquivo.nomeOriginal,
      tipoConteudo: arquivo.tipoConteudo,
      tamanhoBytes: arquivo.conteudo.byteLength,
      conteudo: arquivo.conteudo,
    });
    arquivos.push({
      novo: {
        chaveArmazenamento: guardado.chave,
        nomeOriginal: arquivo.nomeOriginal.slice(0, 200),
        tipoConteudo: arquivo.tipoConteudo,
        tamanhoBytes: guardado.tamanhoBytes,
        impressaoDigital: guardado.impressaoDigital,
      },
    });
  }

  const { codigo } = await dependencias.repositorio.receberDocumento(escopo, {
    tokenId,
    ano: Number(hojeDataCivil(FUSO, dependencias.agora?.()).slice(0, 4)),
    observacao,
    arquivos,
    remetente: {
      ipAnonimo: anonimizarIp(envio.remetente.ip, dependencias.salDoIp),
      agenteUsuario: envio.remetente.agenteUsuario,
    },
  });
  return { codigo };
}
