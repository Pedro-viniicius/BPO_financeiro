"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ehErroDominio } from "@/compartilhado/erros/indice";
import type { GrupoDre } from "@/modulos/dre/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("plano-de-contas");

export interface EstadoPlano {
  readonly mensagem?: string;
  readonly sucesso?: string;
  readonly campos?: Record<string, readonly string[]>;
}

const GRUPOS = [
  "receita_bruta",
  "deducao",
  "custo",
  "despesa_operacional",
  "resultado_financeiro",
  "nao_operacional",
  "transferencia",
] as const;

const esquemaConta = z.object({
  contaId: z.string().uuid().optional(),
  // O CHECK do banco exige "3", "3.1", "3.1.01"...
  codigo: z
    .string()
    .trim()
    .regex(/^[0-9]+(\.[0-9]+)*$/, "Use números separados por ponto, como 4.1.01."),
  nome: z.string().trim().min(2, "Dê um nome à conta.").max(120),
  grupoDre: z.enum(GRUPOS),
});

const esquemaCategoria = z.object({
  categoriaId: z.string().uuid().optional(),
  nome: z.string().trim().min(2, "Dê um nome à categoria.").max(120),
  contaPlanoId: z.string().uuid("Escolha a conta do plano."),
});

const esquemaSituacao = z.object({
  id: z.string().uuid(),
  ativa: z.enum(["sim", "nao"]),
});

const esquemaExclusao = z.object({ id: z.string().uuid() });

function texto(formulario: FormData, campo: string): string | undefined {
  const valor = formulario.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function atualizar() {
  revalidatePath("/cadastros/plano-de-contas");
  // As telas de lancamento montam os seletores a partir das categorias ativas.
  revalidatePath("/cadastros");
  revalidatePath("/contas-pagar/nova");
  revalidatePath("/contas-receber/nova");
}

/** Traduz erro de dominio e de banco em frase util; o resto vira mensagem generica. */
function mensagemDoErro(erro: unknown, oQue: "conta" | "categoria"): string {
  if (ehErroDominio(erro)) return erro.message;
  const texto = erro instanceof Error ? erro.message : "";
  if (/unico_contas_plano_codigo/.test(texto)) return "Já existe uma conta com esse código.";
  if (/unico_categorias_nome/.test(texto)) return "Já existe uma categoria com esse nome.";
  if (/verifica_contas_plano_codigo/.test(texto)) return "Código fora do formato. Use números separados por ponto.";
  // Ultima barreira: a chave estrangeira recusou a exclusao.
  if (/violates foreign key|viola a chave estrangeira/i.test(texto)) {
    return oQue === "categoria"
      ? "Esta categoria está em uso em algum lançamento e não pode ser excluída. Inative-a."
      : "Esta conta ainda é usada e não pode ser excluída. Inative-a.";
  }
  return oQue === "conta" ? "Não foi possível salvar a conta." : "Não foi possível salvar a categoria.";
}

export async function acaoSalvarConta(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");

  const analise = esquemaConta.safeParse({
    contaId: texto(formulario, "contaId"),
    codigo: texto(formulario, "codigo"),
    nome: texto(formulario, "nome"),
    grupoDre: texto(formulario, "grupoDre"),
  });
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }
  const { contaId, ...dados } = analise.data;

  try {
    const repositorio = repositorios.planoContas();
    if (contaId) await repositorio.editarConta(escopo, contaId, { ...dados, grupoDre: dados.grupoDre as GrupoDre }, usuarioId);
    else await repositorio.criarConta(escopo, { ...dados, grupoDre: dados.grupoDre as GrupoDre }, usuarioId);
  } catch (erro) {
    logs.erro("falha ao salvar conta do plano", { erro });
    return { mensagem: mensagemDoErro(erro, "conta") };
  }

  atualizar();
  return { sucesso: contaId ? "Conta atualizada." : "Conta criada." };
}

export async function acaoSalvarCategoria(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");

  const analise = esquemaCategoria.safeParse({
    categoriaId: texto(formulario, "categoriaId"),
    nome: texto(formulario, "nome"),
    contaPlanoId: texto(formulario, "contaPlanoId"),
  });
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }
  const { categoriaId, ...dados } = analise.data;

  try {
    const repositorio = repositorios.planoContas();
    if (categoriaId) await repositorio.editarCategoria(escopo, categoriaId, dados, usuarioId);
    else await repositorio.criarCategoria(escopo, dados, usuarioId);
  } catch (erro) {
    logs.erro("falha ao salvar categoria", { erro });
    return { mensagem: mensagemDoErro(erro, "categoria") };
  }

  atualizar();
  return { sucesso: categoriaId ? "Categoria atualizada." : "Categoria criada." };
}

export async function acaoAlterarSituacaoConta(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");
  const analise = esquemaSituacao.safeParse({ id: texto(formulario, "id"), ativa: texto(formulario, "ativa") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  try {
    await repositorios.planoContas().alterarSituacaoConta(escopo, analise.data.id, analise.data.ativa === "sim", usuarioId);
  } catch (erro) {
    logs.erro("falha ao alterar situacao da conta", { erro });
    return { mensagem: mensagemDoErro(erro, "conta") };
  }

  atualizar();
  return { sucesso: analise.data.ativa === "sim" ? "Conta reativada." : "Conta inativada." };
}

export async function acaoAlterarSituacaoCategoria(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");
  const analise = esquemaSituacao.safeParse({ id: texto(formulario, "id"), ativa: texto(formulario, "ativa") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  try {
    await repositorios.planoContas().alterarSituacaoCategoria(escopo, analise.data.id, analise.data.ativa === "sim", usuarioId);
  } catch (erro) {
    logs.erro("falha ao alterar situacao da categoria", { erro });
    return { mensagem: mensagemDoErro(erro, "categoria") };
  }

  atualizar();
  return { sucesso: analise.data.ativa === "sim" ? "Categoria reativada." : "Categoria inativada." };
}

export async function acaoExcluirConta(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");
  const analise = esquemaExclusao.safeParse({ id: texto(formulario, "id") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  try {
    await repositorios.planoContas().excluirConta(escopo, analise.data.id, usuarioId);
  } catch (erro) {
    logs.erro("falha ao excluir conta", { erro });
    return { mensagem: mensagemDoErro(erro, "conta") };
  }

  atualizar();
  return { sucesso: "Conta excluída." };
}

export async function acaoExcluirCategoria(_anterior: EstadoPlano, formulario: FormData): Promise<EstadoPlano> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");
  const analise = esquemaExclusao.safeParse({ id: texto(formulario, "id") });
  if (!analise.success) return { mensagem: "Pedido inválido." };

  try {
    await repositorios.planoContas().excluirCategoria(escopo, analise.data.id, usuarioId);
  } catch (erro) {
    logs.erro("falha ao excluir categoria", { erro });
    return { mensagem: mensagemDoErro(erro, "categoria") };
  }

  atualizar();
  return { sucesso: "Categoria excluída." };
}

/**
 * Acrescenta o que falta do plano padrao.
 *
 * Reusa o semeador que ja existia em `cadastros` em vez de duplicar a lista:
 * duas listas de plano padrao divergiriam na primeira correcao.
 */
export async function acaoUsarPlanoPadrao(_anterior: EstadoPlano, _formulario: FormData): Promise<EstadoPlano> {
  const { escopo } = await exigirContextoFinanceiro("plano_contas.editar", "/cadastros/plano-de-contas");

  try {
    const { contasCriadas, categoriasCriadas } = await repositorios.cadastros().semearPlanoPadrao(escopo);
    atualizar();
    if (contasCriadas === 0 && categoriasCriadas === 0) {
      return { sucesso: "O plano padrão já está todo aqui. Nada foi alterado." };
    }
    return {
      sucesso: `Criadas ${contasCriadas} ${contasCriadas === 1 ? "conta" : "contas"} e ${categoriasCriadas} ${categoriasCriadas === 1 ? "categoria" : "categorias"}.`,
    };
  } catch (erro) {
    logs.erro("falha ao usar o plano padrao", { erro });
    return { mensagem: "Não foi possível aplicar o plano padrão." };
  }
}
