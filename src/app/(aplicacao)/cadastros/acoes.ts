"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("cadastros");

export interface EstadoFormulario {
  readonly mensagem?: string;
  readonly sucesso?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const esquemaPessoa = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  tipo: z.enum(["fisica", "juridica"]),
  cpfCnpj: z.string().trim().optional(),
  email: z.string().trim().optional(),
  telefone: z.string().trim().optional(),
  papelCliente: z.string().optional(),
  papelFornecedor: z.string().optional(),
});

const esquemaCategoria = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria."),
  contaPlanoId: z.string().uuid("Escolha uma conta do plano."),
});

function campos(erro: z.ZodError): Record<string, string[]> {
  return z.flattenError(erro).fieldErrors as Record<string, string[]>;
}

export async function acaoCriarPessoa(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo } = await exigirContextoFinanceiro("cadastros.editar", "/cadastros");

  const analise = esquemaPessoa.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  const ehCliente = analise.data.papelCliente === "on";
  const ehFornecedor = analise.data.papelFornecedor === "on";
  // Pessoa sem papel nenhum nao serve a nada: nao apareceria em seletor de
  // titulo e viraria cadastro orfao.
  if (!ehCliente && !ehFornecedor) {
    return { mensagem: "Escolha ao menos um papel.", campos: { papelCliente: ["Marque cliente, fornecedor, ou os dois."] } };
  }

  try {
    await repositorios.cadastros().criarPessoa(escopo, {
      nome: analise.data.nome,
      tipo: analise.data.tipo,
      ...(analise.data.cpfCnpj ? { cpfCnpj: analise.data.cpfCnpj.replace(/\D/g, "") } : {}),
      ...(analise.data.email ? { email: analise.data.email } : {}),
      ...(analise.data.telefone ? { telefone: analise.data.telefone } : {}),
      ehCliente,
      ehFornecedor,
    });
  } catch (erro) {
    logs.erro("falha ao criar pessoa", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar agora. Confira se o CPF/CNPJ já não está cadastrado." };
  }

  revalidatePath("/cadastros");
  return { sucesso: `${analise.data.nome} foi cadastrado.` };
}

export async function acaoCriarCategoria(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo } = await exigirContextoFinanceiro("cadastros.editar", "/cadastros");

  const analise = esquemaCategoria.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  try {
    await repositorios.cadastros().criarCategoria(escopo, analise.data);
  } catch (erro) {
    logs.erro("falha ao criar categoria", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar. Talvez já exista uma categoria com esse nome." };
  }

  revalidatePath("/cadastros");
  return { sucesso: `Categoria ${analise.data.nome} criada.` };
}

/**
 * Cria o plano de contas inicial. Explicito e idempotente: se ja houver plano,
 * nao mexe em nada.
 */
export async function acaoSemearPlanoPadrao(_anterior: EstadoFormulario, _formulario: FormData): Promise<EstadoFormulario> {
  const { escopo } = await exigirContextoFinanceiro("cadastros.editar", "/cadastros");
  try {
    const { contasCriadas, categoriasCriadas } = await repositorios.cadastros().semearPlanoPadrao(escopo);
    revalidatePath("/cadastros");
    if (contasCriadas === 0) return { sucesso: "Esta empresa já tem plano de contas." };
    return { sucesso: `Plano criado: ${contasCriadas} contas e ${categoriasCriadas} categorias.` };
  } catch (erro) {
    logs.erro("falha ao semear plano de contas", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível criar o plano agora. Tente novamente em instantes." };
  }
}
