import type { DataCivil } from "@/compartilhado/datas/indice";
import type { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import type { Candidata, ConfiancaConciliacao } from "../dominio/sugestao-de-conciliacao";

/**
 * Contrato da conciliacao bancaria.
 *
 * Todo metodo recebe `EscopoEmpresa`: e a barreira entre empresas (ADR-017).
 *
 * NADA aqui concilia sozinho. Os metodos de escrita recebem exatamente o que o
 * usuario escolheu; as sugestoes sao so leitura, e existem para encurtar a
 * decisao, nunca para toma-la.
 */

export interface DadosImportacaoOfx {
  readonly contaBancariaId: string;
  readonly nomeArquivo: string;
  readonly conteudo: Uint8Array;
  readonly usuarioId: string;
  /**
   * O usuario confirmou que o arquivo e desta conta mesmo, depois do aviso de
   * divergencia. Sem isso, a importacao para e devolve o aviso.
   */
  readonly confirmouContaDivergente?: boolean;
}

export interface ResultadoImportacao {
  readonly extratoId: string;
  readonly importados: number;
  /** Ja existiam (mesmo FITID na mesma conta). Reimportar o mesmo arquivo nao duplica. */
  readonly duplicados: number;
  readonly dataInicio: DataCivil | null;
  readonly dataFim: DataCivil | null;
  readonly saldoInformado: Dinheiro | null;
}

/** Divergencia entre a conta do arquivo e a conta escolhida na tela. */
export interface DivergenciaDeConta {
  readonly agenciaDoArquivo: string | null;
  readonly contaDoArquivo: string | null;
  readonly agenciaCadastrada: string | null;
  readonly contaCadastrada: string | null;
}

export interface ItemDoExtrato {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly descricao: string;
  readonly numeroDocumento: string | null;
  readonly conciliado: boolean;
  readonly ignorado: boolean;
  readonly motivoIgnorar: string | null;
  /** Vazio quando ja esta conciliado ou quando nada casa. */
  readonly candidatas: readonly Candidata[];
  readonly confianca: ConfiancaConciliacao;
  readonly exata: boolean;
  /** Preenchido quando o item ja esta conciliado. */
  readonly conciliacaoId: string | null;
}

export interface MovimentacaoPendente {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
  readonly descricao: string;
  readonly origem: string;
  readonly categoriaNome: string | null;
}

export interface ResumoDaConciliacao {
  /** Saldo que o BANCO informou no ultimo extrato importado. */
  readonly saldoDoExtrato: Dinheiro | null;
  readonly saldoDoSistema: Dinheiro;
  /** Extrato menos sistema. Zero e o objetivo. */
  readonly diferenca: Dinheiro | null;
  readonly itensPendentes: number;
  readonly movimentacoesPendentes: number;
  readonly sugestoesExatas: number;
}

export interface PainelDeConciliacao {
  readonly contaBancariaId: string;
  readonly contaNome: string;
  readonly itens: readonly ItemDoExtrato[];
  readonly movimentacoes: readonly MovimentacaoPendente[];
  readonly resumo: ResumoDaConciliacao;
  readonly temExtrato: boolean;
}

export interface ImportacaoNaLista {
  readonly id: string;
  readonly nomeArquivo: string;
  readonly importadoEm: Date;
  readonly importadoPorNome: string | null;
  readonly dataInicio: DataCivil | null;
  readonly dataFim: DataCivil | null;
  readonly quantidadeItens: number;
}

export interface DadosConciliacao {
  readonly contaBancariaId: string;
  readonly itensExtratoIds: readonly string[];
  readonly movimentacaoIds: readonly string[];
  readonly origemDecisao: "manual" | "sugestao_aceita" | "lote";
  readonly usuarioId: string;
}

export interface DadosLancamentoDoItem {
  readonly categoriaId: string;
  readonly usuarioId: string;
}

export interface DadosBaixaDoItem {
  readonly area: "pagar" | "receber";
  readonly parcelaId: string;
  readonly formaPagamento: string;
  readonly usuarioId: string;
}

export interface RepositorioConciliacao {
  /** Le o OFX, grava o lote e os itens novos. Reimportacao nao duplica. */
  importarOfx(escopo: EscopoEmpresa, dados: DadosImportacaoOfx): Promise<ResultadoImportacao>;
  montarPainel(escopo: EscopoEmpresa, contaBancariaId: string, hoje: DataCivil): Promise<PainelDeConciliacao | null>;
  listarImportacoes(escopo: EscopoEmpresa, contaBancariaId: string): Promise<readonly ImportacaoNaLista[]>;
  /** Liga N itens do extrato a N movimentacoes. A soma dos dois lados precisa bater. */
  conciliar(escopo: EscopoEmpresa, dados: DadosConciliacao): Promise<{ conciliacaoId: string }>;
  /** Aceita de uma vez as sugestoes exatas (mesmo valor, mesma data, unicas dos dois lados). */
  aceitarSugestoesExatas(escopo: EscopoEmpresa, contaBancariaId: string, usuarioId: string): Promise<{ conciliadas: number }>;
  desconciliar(escopo: EscopoEmpresa, conciliacaoId: string, dados: { motivo: string; usuarioId: string }): Promise<void>;
  /** Cria a movimentacao avulsa (tarifa, rendimento) do item e ja concilia. */
  criarLancamentoDoItem(escopo: EscopoEmpresa, itemId: string, dados: DadosLancamentoDoItem): Promise<{ movimentacaoId: string }>;
  /** Da baixa numa parcela a partir do item e ja concilia. Tudo na mesma transacao. */
  criarBaixaDoItem(escopo: EscopoEmpresa, itemId: string, dados: DadosBaixaDoItem): Promise<{ movimentacaoId: string }>;
  ignorarItem(escopo: EscopoEmpresa, itemId: string, dados: { motivo: string; usuarioId: string }): Promise<void>;
}
