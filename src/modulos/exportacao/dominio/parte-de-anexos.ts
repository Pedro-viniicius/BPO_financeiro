import { montarZip, type ArquivoDoZip } from "@/compartilhado/arquivos/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Anexos no pacote de exportacao: PARTES MENSAIS (ADR-027).
 *
 * O ZIP de dados continua unico. Os anexos saem um ZIP por mes, metodo
 * STORE — imagem e PDF ja sao comprimidos, comprimir de novo so gasta CPU —,
 * com LEIAME listando os arquivos e o SHA-256 de cada um. O escritor de ZIP
 * do projeto nao tem ZIP64 e monta o pacote em memoria: e a memoria que
 * limita, nao o formato. Partes mensais mantem cada uma pequena; se um mes
 * isolado passar do teto, a mensagem diz isso em portugues, em vez de um
 * pacote que quebra em silencio.
 */
export const TETO_PARTE_ANEXOS_BYTES = 512 * 1024 * 1024;

export interface AnexoParaExportar {
  readonly codigoDocumento: string;
  readonly ordem: number;
  readonly nomeOriginal: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  /** SHA-256 registrado no banco quando o arquivo entrou. */
  readonly impressaoDigital: string;
  readonly conteudo: Uint8Array;
}

export class ParteGrandeDemais extends ErroDominio {
  readonly codigo = "parte_de_anexos_grande_demais";
  readonly categoria: CategoriaErro = "regra_negocio";
  constructor(mes: string, bytes: number) {
    super(
      `Os anexos de ${mes} somam ${(bytes / (1024 * 1024)).toFixed(0)} MB, acima do teto de ${TETO_PARTE_ANEXOS_BYTES / (1024 * 1024)} MB por parte. ` +
        "Este mês precisa sair em partes menores; fale com o suporte para uma exportação assistida.",
    );
  }
}

/** Nome dentro do ZIP: pasta por documento, ordem na frente, nome original limpo. Nunca vira caminho fora da pasta. */
export function nomeNoPacote(anexo: Pick<AnexoParaExportar, "codigoDocumento" | "ordem" | "nomeOriginal">): string {
  const nome = anexo.nomeOriginal.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, ".").replace(/^\.+/, "").slice(0, 100) || "arquivo";
  return `anexos/${anexo.codigoDocumento}/${String(anexo.ordem + 1).padStart(2, "0")}-${nome}`;
}

export function montarParteDeAnexos(
  mes: string,
  nomeEmpresa: string,
  anexos: readonly AnexoParaExportar[],
  agora = new Date(),
): { readonly zip: Buffer; readonly quantidade: number; readonly bytes: number } {
  const bytes = anexos.reduce((soma, a) => soma + a.conteudo.byteLength, 0);
  if (bytes > TETO_PARTE_ANEXOS_BYTES) throw new ParteGrandeDemais(mes, bytes);

  const linhas = anexos.map((a) => `${a.impressaoDigital}  ${nomeNoPacote(a)}`);
  const leiame = [
    `ANEXOS — ${nomeEmpresa} — parte ${mes}`,
    `Gerado em ${agora.toISOString()}`,
    "",
    "Um arquivo por anexo, na pasta do protocolo do documento (DC-AAAA-NNNNNN),",
    "com a ordem em que foram enviados. Os arquivos estao SEM compressao (STORE):",
    "imagem e PDF ja sao comprimidos.",
    "",
    "SOMAS-SHA256.txt esta no formato de `sha256sum -c`: rode-o na pasta",
    "descompactada para provar que nada mudou desde o envio — a soma foi",
    "registrada quando o arquivo entrou, nao na hora de exportar.",
    "",
    `Total: ${anexos.length} arquivo(s), ${bytes} bytes.`,
    "",
    ...anexos.map((a) => `${nomeNoPacote(a)}  (${a.tipoConteudo}, ${a.tamanhoBytes} bytes)`),
    "",
  ].join("\n");

  // Tudo em STORE, inclusive os textos: a parte inteira fica legivel com qualquer ferramenta, ate sem descompactar.
  const arquivos: ArquivoDoZip[] = [
    { nome: `LEIAME.txt`, conteudo: leiame, comprimir: false },
    { nome: `SOMAS-SHA256.txt`, conteudo: linhas.join("\n") + "\n", comprimir: false },
    ...anexos.map((a) => ({ nome: nomeNoPacote(a), conteudo: Buffer.from(a.conteudo), comprimir: false })),
  ];
  return { zip: montarZip(arquivos, agora), quantidade: anexos.length, bytes };
}
