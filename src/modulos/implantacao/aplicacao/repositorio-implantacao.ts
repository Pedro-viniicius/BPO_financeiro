import type { DataCivil } from "@/compartilhado/datas/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import type { ContaImportada, ErroDaLinha, PessoaImportada } from "../dominio/planilhas";

/**
 * A carga inicial: trazer para dentro do sistema a situacao em que a empresa
 * ja estava no dia em que comecou a usa-lo.
 *
 * TUDO OU NADA em cada importacao. Uma importacao pela metade e pior do que
 * nenhuma: a pessoa nao sabe o que entrou, corrige a planilha inteira, importa
 * de novo e duplica o que ja tinha passado.
 *
 * Cada importacao vira um LOTE, e o lote pode ser DESFEITO — enquanto nada do
 * que entrou tiver sido usado. Depois que uma conta importada recebe baixa ou
 * e editada, desfazer deixaria de ser reversivel: apagaria um pagamento real.
 */

export type EtapaDaImplantacao = "empresa" | "plano" | "bancos" | "pessoas" | "contas" | "dividas";

export interface SituacaoDaEtapa {
  readonly etapa: EtapaDaImplantacao;
  readonly titulo: string;
  readonly explicacao: string;
  readonly concluida: boolean;
  /** O que ja existe, em uma frase ("12 contas, 31 categorias"). */
  readonly resumo: string;
  readonly rota: string;
}

export interface LoteDeImportacao {
  readonly id: string;
  readonly tipo: "pessoas" | "contas";
  readonly arquivoNome: string;
  readonly quantidade: number;
  readonly criadoEm: Date;
  readonly criadoPorNome: string;
  readonly desfeitoEm: Date | null;
  readonly motivoDesfazer: string | null;
  /** Falso quando algo do lote ja foi usado. A tela explica o porque. */
  readonly podeDesfazer: boolean;
  readonly motivoNaoPodeDesfazer: string | null;
}

export interface ResultadoDaImportacao {
  readonly loteId: string;
  readonly criados: number;
  /** Pessoas que ja existiam e so ganharam o papel. Nao sao duplicadas. */
  readonly reaproveitados: number;
}

export interface RepositorioImplantacao {
  /** O estado de cada passo do assistente. */
  situacao(escopo: EscopoEmpresa): Promise<readonly SituacaoDaEtapa[]>;

  /**
   * Confere as contas contra o que existe no banco (categoria e pessoa),
   * SEM gravar. E o que a previa mostra antes de a pessoa confirmar.
   */
  conferirContas(escopo: EscopoEmpresa, contas: readonly ContaImportada[]): Promise<readonly ErroDaLinha[]>;

  importarPessoas(
    escopo: EscopoEmpresa,
    dados: { readonly arquivoNome: string; readonly pessoas: readonly PessoaImportada[] },
    usuarioId: string,
  ): Promise<ResultadoDaImportacao>;

  importarContas(
    escopo: EscopoEmpresa,
    dados: { readonly arquivoNome: string; readonly contas: readonly ContaImportada[] },
    usuarioId: string,
  ): Promise<ResultadoDaImportacao>;

  listarLotes(escopo: EscopoEmpresa): Promise<readonly LoteDeImportacao[]>;

  /** Desfaz o lote inteiro. Recusa se qualquer item ja tiver sido usado. */
  desfazerLote(escopo: EscopoEmpresa, loteId: string, motivo: string, usuarioId: string): Promise<{ removidos: number }>;

  /** A data de corte da empresa, que a validacao das contas usa. */
  dataDeCorte(escopo: EscopoEmpresa): Promise<DataCivil | null>;
}
