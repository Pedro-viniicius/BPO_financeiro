import { adicionarDias, compararDatas, criarDataCivil, hojeDataCivil, partesDaData, type DataCivil } from "@/compartilhado/datas/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Conferencia de um documento capturado: a equipe classifica e decide.
 *
 * As situacoes sao as do enum `situacao_documento_capturado` (migracao 0010).
 * `arquivado_sem_conferencia` nao e rejeicao: rejeitado e um juizo assinado,
 * com motivo; arquivado e a AUSENCIA de juizo. Um arquivado (ou um rejeitado)
 * pode ser reaberto — acao explicita, auditada, que reinicia a contagem de
 * abandono. Aprovado nao volta: a conta ja nasceu.
 */
export type SituacaoDocumento = "pendente_conferencia" | "aprovado" | "rejeitado" | "arquivado_sem_conferencia";

export const NOMES_SITUACAO_DOCUMENTO: Record<SituacaoDocumento, string> = {
  pendente_conferencia: "Pendente de conferência",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  arquivado_sem_conferencia: "Arquivado sem conferência",
};

/** Retencao (prazos aprovados no Gate 10). */
export const RETENCAO_APROVADO_ANOS = 5;
export const RETENCAO_REJEITADO_DIAS = 90;
export const AVISO_PENDENTE_DIAS = 30;
export const ABANDONO_DIAS = 90;
export const EXPURGO_ARQUIVADO_ANOS = 1;
export const TAMANHO_MINIMO_MOTIVO = 3;
export const TAMANHO_MAXIMO_MOTIVO = 500;

/** Fuso das datas de negocio (invariante 4). */
export const FUSO_DAS_DATAS = "America/Sao_Paulo";

/** Data civil, no fuso do sistema, de um instante tecnico (ex.: `criado_em` do envio). */
export function dataCivilDoInstante(instante: Date): DataCivil {
  return hojeDataCivil(FUSO_DAS_DATAS, instante);
}

/**
 * Marco de retencao de um documento APROVADO: a data mais tardia entre as
 * candidatas (AAMM da chave, competencia, envio), levada a 1o de janeiro do
 * ano seguinte, mais 5 anos — art. 173, I, do CTN. Congelado na conferencia:
 * editar a competencia depois nao muda quando o conteudo sai.
 */
export function marcoDeRetencaoAprovado(candidatas: readonly DataCivil[]): DataCivil {
  if (candidatas.length === 0) throw new Error("O marco de retencao precisa de ao menos uma data.");
  const maisTardia = candidatas.reduce((a, b) => (compararDatas(a, b) >= 0 ? a : b));
  const { ano } = partesDaData(maisTardia);
  return criarDataCivil(ano + 1 + RETENCAO_APROVADO_ANOS, 1, 1);
}

/** Rejeitado: 90 dias contados da rejeicao. */
export function marcoDeRetencaoRejeitado(dataDaRejeicao: DataCivil): DataCivil {
  return adicionarDias(dataDaRejeicao, RETENCAO_REJEITADO_DIAS);
}

/** Arquivado por abandono: o conteudo sai 1 ano depois do ENVIO. */
export function marcoDeRetencaoArquivado(dataDoEnvio: DataCivil): DataCivil {
  const { ano, mes, dia } = partesDaData(dataDoEnvio);
  return criarDataCivil(ano + EXPURGO_ARQUIVADO_ANOS, mes, dia);
}

export class DocumentoNaoEncontrado extends ErroDominio {
  readonly codigo = "documento_nao_encontrado";
  readonly categoria: CategoriaErro = "nao_encontrado";
  constructor() {
    super("Documento não encontrado.");
  }
}

export class DocumentoNaoPendente extends ErroDominio {
  readonly codigo = "documento_nao_pendente";
  readonly categoria: CategoriaErro = "regra_negocio";
  constructor(situacao: SituacaoDocumento) {
    super(`Este documento já foi conferido (${NOMES_SITUACAO_DOCUMENTO[situacao].toLowerCase()}). Nada foi alterado.`);
  }
}

export class DocumentoNaoReabrivel extends ErroDominio {
  readonly codigo = "documento_nao_reabrivel";
  readonly categoria: CategoriaErro = "regra_negocio";
  constructor(situacao: SituacaoDocumento) {
    super(
      situacao === "aprovado"
        ? "Documento aprovado não volta para a fila: a conta a pagar já nasceu. Trate a conta no Contas a pagar."
        : "Este documento já está na fila.",
    );
  }
}

export class MotivoDeRejeicaoInvalido extends ErroDominio {
  readonly codigo = "motivo_rejeicao_invalido";
  readonly categoria: CategoriaErro = "validacao";
  constructor() {
    super(`Explique o motivo da rejeição (de ${TAMANHO_MINIMO_MOTIVO} a ${TAMANHO_MAXIMO_MOTIVO} caracteres): quem enviou vai precisar entender.`);
  }
}

export function normalizarMotivo(motivo: string | null | undefined): string {
  const limpo = (motivo ?? "").trim();
  if (limpo.length < TAMANHO_MINIMO_MOTIVO || limpo.length > TAMANHO_MAXIMO_MOTIVO) throw new MotivoDeRejeicaoInvalido();
  return limpo;
}

export function podeReabrir(situacao: SituacaoDocumento): boolean {
  return situacao === "rejeitado" || situacao === "arquivado_sem_conferencia";
}
