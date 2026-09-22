"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("contas-receber");

export interface EstadoFormulario {
  readonly mensagem?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const esquemaNovaConta = z.object({
  descricao: z.string().trim().min(1, "Informe uma descrição."),
  clienteId: z.string().uuid("Escolha um cliente."),
  categoriaId: z.string().uuid("Escolha uma categoria."),
  dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  valor: z.string().min(1, "Informe o valor."),
  observacoes: z.string().trim().optional(),
});

const esquemaRecebimento = z.object({
  parcelaId: z.string().uuid(),
  contaBancariaId: z.string().uuid("Escolha a conta que vai receber o dinheiro."),
  dataRecebimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do recebimento."),
  valorPrincipal: z.string().min(1, "Informe o valor."),
  valorJuros: z.string().optional(),
  valorMulta: z.string().optional(),
  valorDesconto: z.string().optional(),
  formaPagamento: z.string().min(1, "Escolha a forma de recebimento."),
});

function dinheiroDoFormulario(texto: string | undefined): Dinheiro {
  if (!texto || !texto.trim()) return Dinheiro.zero();
  return Dinheiro.deTextoBrasileiro(texto);
}

function campos(erro: z.ZodError): Record<string, string[]> {
  return z.flattenError(erro).fieldErrors as Record<string, string[]>;
}

/** Criar exige `contas_receber.criar` — a verificacao acontece aqui, no servidor. */
export async function acaoCriarContaReceber(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_receber.criar", "/contas-receber/nova");

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
    await repositorios.contasReceber().criar(
      escopo,
      {
        descricao: analise.data.descricao,
        clienteId: analise.data.clienteId,
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

  revalidatePath("/contas-receber");
  redirect("/contas-receber");
}

/** Registrar recebimento exige `contas_receber.baixar`. */
export async function acaoRegistrarRecebimento(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_receber.baixar", "/contas-receber");

  const analise = esquemaRecebimento.safeParse(Object.fromEntries(formulario.entries()));
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
    await repositorios.contasReceber().registrarRecebimento(escopo, analise.data.parcelaId, {
      contaBancariaId: analise.data.contaBancariaId,
      dataRecebimento: dataCivilDeTexto(analise.data.dataRecebimento),
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
    logs.erro("falha ao registrar recebimento", { erro: codigo });
    return { mensagem: "Não foi possível registrar o recebimento agora. Tente novamente em instantes." };
  }

  revalidatePath(`/contas-receber/${analise.data.parcelaId}`);
  revalidatePath("/contas-receber");
  redirect(`/contas-receber/${analise.data.parcelaId}`);
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
