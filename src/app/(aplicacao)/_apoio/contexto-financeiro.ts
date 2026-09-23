import { hojeDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { exigirAcesso, type PermissoesExigidas } from "@/nucleo/empresas/publico";
import { RepositorioContasBancariasDrizzle } from "@/modulos/bancos/publico";
import { RepositorioCadastrosDrizzle } from "@/modulos/cadastros/publico";
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";
import { RepositorioContasReceberDrizzle } from "@/modulos/contas-receber/publico";
import { RepositorioDividasDrizzle } from "@/modulos/credito-dividas/publico";
import { RepositorioConciliacaoDrizzle } from "@/modulos/conciliacao-bancaria/publico";
import { RepositorioFluxoCaixaDrizzle } from "@/modulos/fluxo-caixa/publico";
import { RepositorioDreDrizzle } from "@/modulos/dre/publico";
import { RepositorioOrcamentoDrizzle } from "@/modulos/orcamento/publico";
import { RepositorioPlanoContasDrizzle } from "@/modulos/plano-contas/publico";
import { RepositorioImplantacaoDrizzle } from "@/modulos/implantacao/publico";
import { RepositorioExportacaoDrizzle } from "@/modulos/exportacao/publico";

/**
 * Porta de entrada das telas financeiras.
 *
 * Junta o que toda pagina do Gate 5 precisa, e nessa ordem:
 *   1. `exigirAcesso` (ADR-026) — sessao, empresa ativa, vinculo e permissao;
 *   2. o `EscopoEmpresa` derivado do contexto do SERVIDOR, nunca do cliente;
 *   3. "hoje" no fuso da empresa, porque a situacao "vencida" depende da data;
 *   4. os repositorios ja montados.
 *
 * Nenhuma pagina monta escopo por conta propria: se o id da empresa pudesse vir
 * de um parametro de rota ou de um campo escondido, o isolamento acabaria ali.
 */
export interface ContextoFinanceiro {
  readonly escopo: EscopoEmpresa;
  readonly hoje: DataCivil;
  readonly usuarioId: string;
  readonly nomeEmpresa: string;
  readonly permissoes: ReadonlySet<string>;
}

export async function exigirContextoFinanceiro(
  permissoes: PermissoesExigidas,
  rotaPadrao: string,
): Promise<ContextoFinanceiro> {
  const { contexto, empresaAtiva, sessao } = await exigirAcesso(permissoes, rotaPadrao);
  return {
    escopo: {
      organizacaoId: comoIdentificador<"Organizacao">(contexto.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(contexto.empresaId),
    },
    hoje: hojeDataCivil(empresaAtiva.fusoHorario),
    usuarioId: sessao.usuarioId,
    nomeEmpresa: empresaAtiva.nomeFantasia ?? empresaAtiva.nome,
    permissoes: contexto.permissoes as ReadonlySet<string>,
  };
}

export const repositorios = {
  contasPagar: () => new RepositorioContasPagarDrizzle(obterBancoDados()),
  contasReceber: () => new RepositorioContasReceberDrizzle(obterBancoDados()),
  cadastros: () => new RepositorioCadastrosDrizzle(obterBancoDados()),
  bancos: () => new RepositorioContasBancariasDrizzle(obterBancoDados()),
  fluxoCaixa: () => new RepositorioFluxoCaixaDrizzle(obterBancoDados()),
  conciliacao: () => new RepositorioConciliacaoDrizzle(obterBancoDados()),
  resultados: () => new RepositorioDreDrizzle(obterBancoDados()),
  orcamento: () => new RepositorioOrcamentoDrizzle(obterBancoDados()),
  dividas: () => new RepositorioDividasDrizzle(obterBancoDados()),
  planoContas: () => new RepositorioPlanoContasDrizzle(obterBancoDados()),
  implantacao: () => new RepositorioImplantacaoDrizzle(obterBancoDados()),
  exportacao: () => new RepositorioExportacaoDrizzle(obterBancoDados()),
};
