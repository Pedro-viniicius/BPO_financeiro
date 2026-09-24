import { createHash } from "node:crypto";

import { hojeDataCivil } from "@/compartilhado/datas/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";
import type { ArmazenamentoArquivos } from "@/nucleo/arquivos/publico";
import { anonimizarIp } from "@/nucleo/auditoria/publico";

import { validarEnvio } from "../dominio/envio";
import { hashDoTokenDeCaptura, temFormatoDeToken } from "../dominio/token-captura";
import type { ArquivoDoEnvio, EscopoResolvidoPorToken, RepositorioCaptura } from "./repositorio-captura";

/** Fuso das datas de negocio do sistema (invariante 4). O ano do protocolo e o ano civil daqui. */
const FUSO = "America/Sao_Paulo";

export interface DependenciasEnvio {
  readonly repositorio: RepositorioCaptura;
  /** Armazenamento com namespace da empresa (composicao decide a implementacao). */
  readonly armazenamentoDe: (empresaId: string) => ArmazenamentoArquivos;
  /** `AUDITORIA_SAL_IP`; sem ele o IP nao e registrado. */
  readonly salDoIp: string | undefined;
}

export interface ArquivoEnviado {
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
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
 * Troca o token da URL pelo escopo da empresa — ANTES de ler qualquer corpo.
 * E o unico ponto do sistema que fabrica um `EscopoEmpresa` sem sessao
 * (ADR-033). Formato errado nem chega ao banco.
 */
export async function resolverEnvio(dependencias: DependenciasEnvio, token: string): Promise<EscopoResolvidoPorToken> {
  if (!temFormatoDeToken(token)) throw new TokenDeCapturaInvalido();
  const resolvido = await dependencias.repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura(token));
  if (!resolvido) throw new TokenDeCapturaInvalido();
  return resolvido;
}

/**
 * Recebe um envio: valida, guarda os arquivos e cria o documento pendente.
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
  token: string,
  envio: Envio,
): Promise<{ readonly codigo: string }> {
  const { escopo, tokenId } = await resolverEnvio(dependencias, token);

  const observacao = envio.observacao?.trim() || null;
  validarEnvio(
    envio.arquivos.map((arquivo) => ({ tamanhoBytes: arquivo.conteudo.byteLength, tipoConteudo: arquivo.tipoConteudo })),
    observacao,
  );

  const armazenamento = dependencias.armazenamentoDe(escopo.empresaId);
  const arquivos: ArquivoDoEnvio[] = [];
  const vistos = new Set<string>();
  for (const arquivo of envio.arquivos) {
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
    ano: Number(hojeDataCivil(FUSO).slice(0, 4)),
    observacao,
    arquivos,
    remetente: {
      ipAnonimo: anonimizarIp(envio.remetente.ip, dependencias.salDoIp),
      agenteUsuario: envio.remetente.agenteUsuario,
    },
  });
  return { codigo };
}
