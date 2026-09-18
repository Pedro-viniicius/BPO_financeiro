import type { IdEmpresa, IdFilial, IdOrganizacao } from "@/compartilhado/tipos/identificadores";

/**
 * Estrutura empresarial (ver ADR-005).
 *
 *   Organizacao -> Empresa -> Filial
 *
 * - Organizacao: grupo economico ou "cliente" do escritorio de BPO.
 * - Empresa: pessoa juridica (CNPJ). E a dona dos dados financeiros.
 * - Filial: unidade operacional da empresa. Opcional.
 */
export interface Organizacao {
  readonly id: IdOrganizacao;
  readonly nome: string;
  readonly ativa: boolean;
}

export interface Empresa {
  readonly id: IdEmpresa;
  readonly organizacaoId: IdOrganizacao;
  readonly nome: string;
  readonly nomeFantasia?: string;
  /** Somente digitos, ou ausente. */
  readonly cnpj?: string;
  readonly fusoHorario: string;
  readonly ativa: boolean;
}

export interface Filial {
  readonly id: IdFilial;
  readonly empresaId: IdEmpresa;
  readonly nome: string;
  readonly ativa: boolean;
}

/**
 * Regra de quais identificadores cada agregado financeiro carrega
 * (documentada em docs/arquitetura/banco-dados.md):
 *
 * - `empresa_id`     -> OBRIGATORIO em todo registro financeiro.
 * - `filial_id`      -> apenas onde ha operacao por unidade (contas, caixa, centros de custo).
 * - `organizacao_id` -> apenas em cadastros compartilhaveis pelo grupo (usuarios, vinculos,
 *                       modelos de plano de contas) e em auditoria/eventos para consulta rapida.
 */
