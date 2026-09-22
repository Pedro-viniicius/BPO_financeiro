"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  gerarParcelas,
  MAXIMO_PARCELAS,
  MINIMO_PARCELAS,
  validarPlanoDeParcelas,
  type ParcelaPlanejada,
  type Periodicidade,
} from "@/compartilhado/financeiro/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { FORMAS_DE_PAGAMENTO } from "../_apoio/formas-de-pagamento";

const logs = criarRegistradorLogs("contas-pagar");

export interface EstadoFormulario {
  readonly mensagem?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");

const esquemaNovaConta = z.object({
  descricao: z.string().trim().min(1, "Informe uma descrição."),
  fornecedorId: z.string().uuid("Escolha um fornecedor."),
  categoriaId: z.string().uuid("Escolha uma categoria."),
  dataVencimento: DATA,
  valor: z.string().min(1, "Informe o valor."),
  modalidade: z.enum(["avista", "parcelado"]).default("avista"),
  quantidadeParcelas: z.string().optional(),
  periodicidade: z.enum(["semanal", "quinzenal", "mensal", "bimestral", "trimestral", "semestral", "anual"]).optional(),
  observacoes: z.string().trim().optional(),
});

const esquemaEdicao = z.object({
  parcelaId: z.string().uuid(),
  descricao: z.string().trim().min(1, "Informe uma descrição."),
  fornecedorId: z.string().uuid("Escolha um fornecedor."),
  categoriaId: z.string().uuid("Escolha uma categoria."),
  dataVencimento: DATA,
  valor: z.string().min(1, "Informe o valor."),
  observacoes: z.string().trim().optional(),
});

const esquemaPagamento = z.object({
  parcelaId: z.string().uuid(),
  contaBancariaId: z.string().uuid("Escolha a conta de onde o dinheiro sai."),
  dataPagamento: DATA,
  valorPrincipal: z.string().min(1, "Informe o valor."),
  valorJuros: z.string().optional(),
  valorMulta: z.string().optional(),
  valorDesconto: z.string().optional(),
  formaPagamento: z.enum(FORMAS_DE_PAGAMENTO, { message: "Escolha a forma de pagamento." }),
});

const esquemaEstorno = z.object({
  pagamentoId: z.string().uuid(),
  parcelaId: z.string().uuid(),
  motivo: z.string().trim().min(5, "Explique o motivo do estorno (mínimo 5 letras)."),
});

const esquemaCancelamento = z.object({
  tituloId: z.string().uuid(),
  parcelaId: z.string().uuid(),
  motivo: z.string().trim().min(5, "Explique o motivo do cancelamento (mínimo 5 letras)."),
});

/** Sinaliza que o formulario chegou sem o numero de parcelas. */
class QuantidadeDeParcelasAusente extends Error {}

function dinheiroDoFormulario(texto: string | undefined): Dinheiro {
  if (!texto || !texto.trim()) return Dinheiro.zero();
  return Dinheiro.deTextoBrasileiro(texto);
}

function campos(erro: z.ZodError): Record<string, string[]> {
  return z.flattenError(erro).fieldErrors as Record<string, string[]>;
}

/**
 * As parcelas que serao gravadas.
 *
 * Quando a tela consegue rodar JavaScript, ela manda a previa que o usuario
 * conferiu (e pode ter ajustado) linha a linha. Sem JavaScript, o formulario
 * manda so o plano (quantas vezes, a partir de quando) e as parcelas nascem
 * aqui pela regra padrao — o cadastro continua funcionando.
 *
 * Em qualquer um dos dois caminhos, a soma e conferida contra o total DEPOIS,
 * no servidor: e o unico lugar em que a conferencia vale.
 */
function parcelasDoFormulario(
  formulario: FormData,
  dados: z.infer<typeof esquemaNovaConta>,
  total: Dinheiro,
): readonly ParcelaPlanejada[] {
  const primeiroVencimento = dataCivilDeTexto(dados.dataVencimento) as DataVencimento;

  if (dados.modalidade === "avista") {
    return [{ numero: 1, dataVencimento: primeiroVencimento, valor: total }];
  }

  const vencimentos = formulario.getAll("parcelaVencimento").map(String).filter(Boolean);
  const valores = formulario.getAll("parcelaValor").map(String).filter(Boolean);

  if (vencimentos.length > 0 && vencimentos.length === valores.length) {
    return vencimentos.map((vencimento, indice) => ({
      numero: indice + 1,
      dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento,
      valor: dinheiroDoFormulario(valores[indice]),
    }));
  }

  const quantidade = Number(dados.quantidadeParcelas);
  if (!Number.isInteger(quantidade) || quantidade < MINIMO_PARCELAS || quantidade > MAXIMO_PARCELAS) {
    // Sem numero de vezes nao ha plano. Assumir "2" criaria em silencio uma
    // conta que ninguem pediu.
    throw new QuantidadeDeParcelasAusente();
  }

  return gerarParcelas({
    quantidade,
    total,
    primeiroVencimento,
    periodicidade: (dados.periodicidade ?? "mensal") as Periodicidade,
  });
}

/** Criar exige `contas_pagar.criar` — a verificacao acontece aqui, no servidor. */
export async function acaoCriarContaPagar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_pagar.criar", "/contas-pagar/nova");

  const bruto = Object.fromEntries(formulario.entries());
  const analise = esquemaNovaConta.safeParse(bruto);
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  let total: Dinheiro;
  let parcelas: readonly ParcelaPlanejada[];
  try {
    total = dinheiroDoFormulario(analise.data.valor);
    if (!total.ehPositivo()) {
      return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };
    }
    parcelas = parcelasDoFormulario(formulario, analise.data, total);
  } catch (erro) {
    if (erro instanceof QuantidadeDeParcelasAusente) {
      const aviso = `Informe em quantas vezes (de ${MINIMO_PARCELAS} a ${MAXIMO_PARCELAS}).`;
      return { mensagem: aviso, campos: { quantidadeParcelas: [aviso] } };
    }
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor ou data inválidos."] } };
  }

  if (analise.data.modalidade === "parcelado") {
    const conferencia = validarPlanoDeParcelas(parcelas, total);
    if (!conferencia.sucesso) {
      return { mensagem: conferencia.erro.message, campos: { quantidadeParcelas: [conferencia.erro.message] } };
    }
  }

  const vencimento = parcelas[0]!.dataVencimento;
  let destino: string;
  try {
    const { parcelaId } = await repositorios.contasPagar().criar(
      escopo,
      {
        descricao: analise.data.descricao,
        fornecedorId: analise.data.fornecedorId,
        categoriaId: analise.data.categoriaId,
        // Competencia assumida como o mes do primeiro vencimento: a tela nao
        // pede competencia separada, e para conta simples as duas coincidem.
        dataCompetencia: dataCivilDeTexto(`${vencimento.slice(0, 8)}01`),
        valorTotal: total,
        parcelas,
        ...(analise.data.observacoes ? { observacoes: analise.data.observacoes } : {}),
      },
      usuarioId,
    );
    destino = `/contas-pagar/${parcelaId}`;
  } catch (erro) {
    logs.erro("falha ao criar conta a pagar", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar agora. Tente novamente em instantes." };
  }

  revalidatePath("/contas-pagar");
  redirect(destino);
}

/** Editar exige `contas_pagar.editar`. As travas por campo sao revalidadas no repositorio. */
export async function acaoEditarContaPagar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_pagar.editar", "/contas-pagar");

  const analise = esquemaEdicao.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  let valor: Dinheiro;
  try {
    valor = dinheiroDoFormulario(analise.data.valor);
  } catch {
    return { mensagem: "Confira os campos destacados.", campos: { valor: ["Valor inválido."] } };
  }
  if (!valor.ehPositivo()) return { mensagem: "Confira os campos destacados.", campos: { valor: ["O valor precisa ser maior que zero."] } };

  try {
    await repositorios.contasPagar().editar(
      escopo,
      analise.data.parcelaId,
      {
        descricao: analise.data.descricao,
        fornecedorId: analise.data.fornecedorId,
        categoriaId: analise.data.categoriaId,
        dataVencimento: dataCivilDeTexto(analise.data.dataVencimento) as DataVencimento,
        valor,
        ...(analise.data.observacoes ? { observacoes: analise.data.observacoes } : {}),
      },
      usuarioId,
    );
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao editar conta a pagar", { erro: codigo });
    return { mensagem: "Não foi possível salvar agora. Tente novamente em instantes." };
  }

  revalidatePath(`/contas-pagar/${analise.data.parcelaId}`);
  revalidatePath("/contas-pagar");
  redirect(`/contas-pagar/${analise.data.parcelaId}`);
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
  revalidatePath("/bancos");
  redirect(`/contas-pagar/${analise.data.parcelaId}`);
}

/**
 * Estornar exige `contas_pagar.pagar`.
 *
 * O catalogo de permissoes nao tem `contas_pagar.estornar`, e inventar uma
 * permissao nova nesta altura mudaria o modelo de seguranca sem que ninguem
 * decidisse isso. A permissao usada e a MESMA de registrar o pagamento: quem
 * pode movimentar dinheiro na conta pode desfazer o proprio erro. Uma
 * permissao separada, para segregar lancar de desfazer, esta proposta na
 * entrega do gate.
 */
export async function acaoEstornarPagamento(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, hoje, usuarioId } = await exigirContextoFinanceiro("contas_pagar.pagar", "/contas-pagar");

  const analise = esquemaEstorno.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  try {
    await repositorios.contasPagar().estornarPagamento(escopo, analise.data.pagamentoId, {
      motivo: analise.data.motivo,
      dataEstorno: hoje,
      usuarioId,
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao estornar pagamento", { erro: codigo });
    return { mensagem: "Não foi possível estornar agora. Tente novamente em instantes." };
  }

  revalidatePath(`/contas-pagar/${analise.data.parcelaId}`);
  revalidatePath("/contas-pagar");
  revalidatePath("/bancos");
  redirect(`/contas-pagar/${analise.data.parcelaId}`);
}

/** Cancelar exige `contas_pagar.cancelar`. */
export async function acaoCancelarContaPagar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("contas_pagar.cancelar", "/contas-pagar");

  const analise = esquemaCancelamento.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos destacados.", campos: campos(analise.error) };

  try {
    await repositorios.contasPagar().cancelar(escopo, analise.data.tituloId, {
      motivo: analise.data.motivo,
      usuarioId,
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    logs.erro("falha ao cancelar conta a pagar", { erro: codigo });
    return { mensagem: "Não foi possível cancelar agora. Tente novamente em instantes." };
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
  PARCELA_CANCELADA: "Esta conta foi cancelada.",
  VALOR_INVALIDO: "O valor precisa ser maior que zero.",
  VALOR_ACIMA_DO_SALDO: "O valor, somado ao desconto, não pode passar do saldo restante.",
  CONTA_BANCARIA_NAO_ENCONTRADA: "Escolha uma conta bancária desta empresa.",
  PAGAMENTO_NAO_ENCONTRADO: "Este pagamento não foi encontrado.",
  PAGAMENTO_JA_ESTORNADO: "Este pagamento já foi estornado.",
  BAIXA_CONCILIADA: "Este pagamento já foi conciliado com o extrato. Desfaça a conciliação antes de estornar.",
  CONTA_NAO_ENCONTRADA: "Esta conta não foi encontrada.",
  CONTA_JA_CANCELADA: "Esta conta já está cancelada.",
  EDICAO_BLOQUEADA: "Esta conta foi cancelada e não pode mais ser editada.",
  FORNECEDOR_BLOQUEADO: "O fornecedor não pode ser trocado depois que há pagamento registrado.",
  VENCIMENTO_BLOQUEADO: "O vencimento não pode mudar depois que esta parcela teve baixa.",
  VALOR_BLOQUEADO: "O valor não pode mudar depois que esta parcela teve baixa. Estorne a baixa primeiro.",
};
