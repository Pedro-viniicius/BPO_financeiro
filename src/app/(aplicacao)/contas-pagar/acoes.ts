"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("contas-pagar");

export interface EstadoFormulario {
  readonly mensagem?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const esquemaNovaConta = z.object({
  descricao: z.string().trim().min(1, "Informe uma descrição."),
  fornecedorId: z.string().uuid("Escolha um fornecedor."),
  categoriaId: z.string().uuid("Escolha uma categoria."),
  dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  valor: z.string().min(1, "Informe o valor."),
  observacoes: z.string().trim().optional(),
});

const esquemaPagamento = z.object({
  parcelaId: z.string().uuid(),
  contaBancariaId: z.string().uuid("Escolha a conta de onde o dinheiro sai."),
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento."),
  valorPrincipal: z.string().min(1, "Informe o valor."),
  valorJuros: z.string().optional(),
  valorMulta: z.string().optional(),
  valorDesconto: z.string().optional(),
  formaPagamento: z.string().min(1, "Escolha a forma de pagamento."),
});

function dinheiroDoFormulario(texto: string | undefined): Dinheiro {
  if (!texto || !texto.trim()) return Dinheiro.zero();
  return Dinheiro.deTextoBrasileiro(texto);
}

function campos(erro: z.ZodError): Record<string, string[]> {
  return z.flattenError(erro).fieldErrors as Record<string, string[]>;
}

/** Criar exige `contas_pagar.criar` — a verificacao acontece aqui, no servidor. */
export async function acaoCriarContaPagar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_pagar.criar", "/contas-pagar/nova");

  const bruto = Object.fromEntries(formulario.entries());
  const analise = esquemaNovaConta.safeParse(bruto);
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  let valor: Dinheiro;
  try {
    valor = dinheiroDoFormulario(analise.data.valor);
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor inválido."] } };
  }
  if (!valor.ehPositivo()) return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };

  const vencimento = dataCivilDeTexto(analise.data.dataVencimento);
  try {
    await repositorios.contasPagar().criar(
      escopo,
      {
        descricao: analise.data.descricao,
        fornecedorId: analise.data.fornecedorId,
        categoriaId: analise.data.categoriaId,
        dataVencimento: vencimento,
        // Competencia assumida como o mes do vencimento: a tela do Gate 5 nao
        // pede competencia separada, e para conta simples as duas coincidem.
        dataCompetencia: dataCivilDeTexto(`${vencimento.slice(0, 8)}01`),
        valor,
        ...(analise.data.observacoes ? { observacoes: analise.data.observacoes } : {}),
      },
      usuarioId,
    );
  } catch (erro) {
    logs.erro("falha ao criar conta a pagar", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar agora. Tente novamente em instantes." };
  }

  revalidatePath("/contas-pagar");
  redirect("/contas-pagar");
}

/** Registrar pagamento exige `contas_pagar.pagar`. */
export async function acaoRegistrarPagamento(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_pagar.pagar", "/contas-pagar");

  const analise = esquemaPagamento.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  let valores;
  try {
    valores = {
      principal: dinheiroDoFormulario(analise.data.valorPrincipal),
      juros: dinheiroDoFormulario(analise.data.valorJuros),
      multa: dinheiroDoFormulario(analise.data.valorMulta),
      desconto: dinheiroDoFormulario(analise.data.valorDesconto),
    };
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valorPrincipal: ["Valor inválido."] } };
  }

  try {
    await repositorios.contasPagar().registrarPagamento(escopo, analise.data.parcelaId, {
      contaBancariaId: analise.data.contaBancariaId,
      dataPagamento: dataCivilDeTexto(analise.data.dataPagamento),
      valorPrincipal: valores.principal,
      valorJuros: valores.juros,
      valorMulta: valores.multa,
      valorDesconto: valores.desconto,
      formaPagamento: analise.data.formaPagamento,
      usuarioId,
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem, campos: { valorPrincipal: [mensagem] } };
    logs.erro("falha ao registrar pagamento", { erro: codigo });
    return { mensagem: "Não foi possível registrar o pagamento agora. Tente novamente em instantes." };
  }

  revalidatePath(`/contas-pagar/${analise.data.parcelaId}`);
  revalidatePath("/contas-pagar");
  redirect(`/contas-pagar/${analise.data.parcelaId}`);
}

/**
 * O repositorio recusa com codigos tecnicos; aqui eles viram frases. O usuario
 * nunca ve `VALOR_ACIMA_DO_SALDO`, e o log guarda o codigo.
 */
const MENSAGENS_DE_RECUSA: Record<string, string> = {
  PARCELA_NAO_ENCONTRADA: "Esta conta não foi encontrada.",
  PARCELA_NAO_ESTA_ABERTA: "Esta conta já foi quitada ou cancelada.",
  VALOR_INVALIDO: "O valor precisa ser maior que zero.",
  VALOR_ACIMA_DO_SALDO: "O valor não pode passar do saldo restante.",
  CONTA_BANCARIA_NAO_ENCONTRADA: "Escolha uma conta bancária desta empresa.",
};
