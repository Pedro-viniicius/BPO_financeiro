"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { ehErroDominio } from "@/compartilhado/erros/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";
import {
  aprovarDocumento, ChaveDeAcessoInvalida, interpretarChaveDeAcesso, reabrirDocumento, rejeitarDocumento, TAMANHO_MAXIMO_MOTIVO,
  type ChaveDeAcesso,
} from "@/modulos/captura-documentos/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("captura-conferencia");

export interface EstadoConferencia {
  readonly mensagem?: string;
  readonly campos?: Record<string, readonly string[]>;
}

const esquemaAprovacao = z.object({
  documentoId: z.string().uuid(),
  descricao: z.string().trim().min(2, "Descreva a conta.").max(200),
  fornecedorId: z.string().uuid("Escolha um fornecedor."),
  categoriaId: z.string().uuid("Escolha uma categoria."),
  valor: z.string().trim().min(1, "Informe o valor."),
  dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  dataCompetencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a competência."),
  chaveAcesso: z.string().trim().optional(),
  observacoes: z.string().trim().max(500).optional(),
});

function texto(formulario: FormData, campo: string): string | undefined {
  const valor = formulario.get(campo);
  return typeof valor === "string" ? valor : undefined;
}

/**
 * Aprovar exige as DUAS permissoes: `captura.conferir` E `contas_pagar.criar`.
 * Sem a segunda, a captura viraria atalho para criar titulo sem ter
 * permissao de criar titulo. A guarda so sabe "uma destas", entao a segunda
 * e conferida aqui, no servidor, sobre o conjunto efetivo.
 */
export async function acaoAprovar(_anterior: EstadoConferencia, formulario: FormData): Promise<EstadoConferencia> {
  const documentoId = texto(formulario, "documentoId") ?? "";
  const { escopo, usuarioId, permissoes } = await exigirContextoFinanceiro("captura.conferir", `/captura/${documentoId}`);
  if (!permissoes.has("contas_pagar.criar")) {
    return { mensagem: "Aprovar cria uma conta a pagar, e o seu acesso não permite criar contas a pagar. Você pode rejeitar ou deixar para quem cria." };
  }

  const analise = esquemaAprovacao.safeParse({
    documentoId,
    descricao: texto(formulario, "descricao"),
    fornecedorId: texto(formulario, "fornecedorId"),
    categoriaId: texto(formulario, "categoriaId"),
    valor: texto(formulario, "valor"),
    dataVencimento: texto(formulario, "dataVencimento"),
    dataCompetencia: texto(formulario, "dataCompetencia"),
    chaveAcesso: texto(formulario, "chaveAcesso") ?? "",
    observacoes: texto(formulario, "observacoes"),
  });
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: z.flattenError(analise.error).fieldErrors as Record<string, string[]> };
  }
  const dados = analise.data;

  // A chave e conferida pelo digito verificador, nao so pelo formato; a data de emissao dela entra no marco de retencao.
  let chave: ChaveDeAcesso | null = null;
  if (dados.chaveAcesso) {
    try {
      chave = interpretarChaveDeAcesso(dados.chaveAcesso);
    } catch (erro) {
      if (erro instanceof ChaveDeAcessoInvalida) return { mensagem: "Confira os campos destacados.", campos: { chaveAcesso: [erro.message] } };
      throw erro;
    }
  }

  let valorTotal: Dinheiro;
  try {
    valorTotal = Dinheiro.deTextoBrasileiro(dados.valor);
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor inválido. Use o formato 1.234,56."] } };
  }
  if (valorTotal.ehZero() || valorTotal.ehNegativo()) {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };
  }

  let destino: string;
  try {
    const { parcelaId } = await aprovarDocumento(
      { repositorio: repositorios.captura() },
      escopo,
      dados.documentoId,
      {
        descricao: dados.descricao,
        fornecedorId: dados.fornecedorId,
        categoriaId: dados.categoriaId,
        valorTotal,
        dataVencimento: dataCivilDeTexto(dados.dataVencimento) as DataVencimento,
        dataCompetencia: dataCivilDeTexto(dados.dataCompetencia),
        chaveAcesso: chave?.chave ?? null,
        ...(chave ? { datasDoDocumento: [chave.emissao] } : {}),
        ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
      },
      usuarioId,
    );
    destino = `/contas-pagar/${parcelaId}`;
  } catch (erro) {
    if (ehErroDominio(erro)) return { mensagem: erro.message };
    logs.erro("falha ao aprovar documento", { erro });
    return { mensagem: "Não foi possível aprovar. Nenhuma conta foi criada." };
  }

  revalidatePath("/captura");
  revalidatePath(`/captura/${dados.documentoId}`);
  revalidatePath("/contas-pagar");
  redirect(destino);
}

export async function acaoRejeitar(_anterior: EstadoConferencia, formulario: FormData): Promise<EstadoConferencia> {
  const documentoId = texto(formulario, "documentoId") ?? "";
  const { escopo, usuarioId, hoje } = await exigirContextoFinanceiro("captura.conferir", `/captura/${documentoId}`);
  const motivo = texto(formulario, "motivo") ?? "";
  if (motivo.length > TAMANHO_MAXIMO_MOTIVO) return { mensagem: `O motivo pode ter no máximo ${TAMANHO_MAXIMO_MOTIVO} caracteres.` };
  try {
    await rejeitarDocumento({ repositorio: repositorios.captura() }, escopo, documentoId, motivo, usuarioId, hoje);
  } catch (erro) {
    if (ehErroDominio(erro)) return { mensagem: erro.message };
    logs.erro("falha ao rejeitar documento", { erro });
    return { mensagem: "Não foi possível rejeitar." };
  }
  revalidatePath("/captura");
  revalidatePath(`/captura/${documentoId}`);
  redirect(`/captura/${documentoId}`);
}

export async function acaoReabrir(_anterior: EstadoConferencia, formulario: FormData): Promise<EstadoConferencia> {
  const documentoId = texto(formulario, "documentoId") ?? "";
  const { escopo, usuarioId } = await exigirContextoFinanceiro("captura.conferir", `/captura/${documentoId}`);
  try {
    await reabrirDocumento({ repositorio: repositorios.captura() }, escopo, documentoId, usuarioId);
  } catch (erro) {
    if (ehErroDominio(erro)) return { mensagem: erro.message };
    logs.erro("falha ao reabrir documento", { erro });
    return { mensagem: "Não foi possível reabrir." };
  }
  revalidatePath("/captura");
  revalidatePath(`/captura/${documentoId}`);
  redirect(`/captura/${documentoId}`);
}
