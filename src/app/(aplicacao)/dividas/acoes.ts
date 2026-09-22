"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  gerarCronograma,
  MAXIMO_PARCELAS_DIVIDA,
  MINIMO_PARCELAS_DIVIDA,
  validarCronograma,
  type ParcelaDoCronograma,
} from "@/compartilhado/financeiro/indice";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("dividas");

export interface EstadoDivida {
  readonly mensagem?: string;
  readonly campos?: Record<string, readonly string[]>;
}

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const esquemaNova = z.object({
  credorPessoaId: z.string().uuid("Escolha o credor."),
  tipo: z.enum(["emprestimo", "financiamento", "cartao_credito", "cheque_especial", "outro"]),
  descricao: z.string().trim().min(3, "Descreva a dívida.").max(200),
  numeroContrato: z.string().trim().max(60).optional(),
  dataContratacao: DATA,
  valorPrincipal: z.string().min(1, "Informe o valor contratado."),
  taxa: z.string().optional(),
  baseDaTaxa: z.enum(["mensal", "anual"]).default("mensal"),
  sistema: z.enum(["price", "sac"]),
  quantidadeParcelas: z.coerce
    .number()
    .int()
    .min(MINIMO_PARCELAS_DIVIDA, `No mínimo ${MINIMO_PARCELAS_DIVIDA} parcela.`)
    .max(MAXIMO_PARCELAS_DIVIDA, `No máximo ${MAXIMO_PARCELAS_DIVIDA} parcelas.`),
  primeiroVencimento: DATA,
  categoriaJurosId: z.string().uuid("Escolha a categoria dos juros."),
  contaBancariaCreditoId: z.string().uuid().optional(),
  observacoes: z.string().trim().max(500).optional(),
});

const esquemaCancelar = z.object({
  dividaId: z.string().uuid(),
  motivo: z.string().trim().min(5, "Escreva o motivo do cancelamento.").max(300),
});

function texto(formulario: FormData, campo: string): string | undefined {
  const valor = formulario.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function taxaDoFormulario(valor: string | undefined): number {
  if (!valor) return 0;
  const numero = Number(valor.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(numero) || numero < 0) throw new Error("taxa");
  return numero;
}

/**
 * Cria a divida com o cronograma que a pessoa CONFERIU na tela.
 *
 * As linhas chegam em tres listas paralelas (`parcelaVencimento`,
 * `parcelaAmortizacao`, `parcelaJuros`), uma entrada por parcela. Sem
 * JavaScript elas nao existem, e o servidor gera o cronograma padrao a partir
 * de valor, taxa, prazo e sistema — cadastrar continua possivel na pagina
 * "crua", so sem o ajuste fino.
 *
 * O cronograma enviado NAO e aceito de olhos fechados: `validarCronograma`
 * exige que a soma das amortizacoes seja exatamente o valor contratado. Sem
 * isso, uma divida de R$ 12.000 poderia nascer amortizando R$ 11.000 — e o
 * saldo devedor nunca mais fecharia.
 */
export async function acaoCriarDivida(_anterior: EstadoDivida, formulario: FormData): Promise<EstadoDivida> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("dividas.editar", "/dividas/nova");

  const analise = esquemaNova.safeParse({
    credorPessoaId: texto(formulario, "credorPessoaId"),
    tipo: texto(formulario, "tipo"),
    descricao: texto(formulario, "descricao"),
    numeroContrato: texto(formulario, "numeroContrato"),
    dataContratacao: texto(formulario, "dataContratacao"),
    valorPrincipal: texto(formulario, "valorPrincipal"),
    taxa: texto(formulario, "taxa"),
    baseDaTaxa: texto(formulario, "baseDaTaxa") ?? "mensal",
    sistema: texto(formulario, "sistema"),
    quantidadeParcelas: texto(formulario, "quantidadeParcelas"),
    primeiroVencimento: texto(formulario, "primeiroVencimento"),
    categoriaJurosId: texto(formulario, "categoriaJurosId"),
    contaBancariaCreditoId: texto(formulario, "contaBancariaCreditoId"),
    observacoes: texto(formulario, "observacoes"),
  });

  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }
  const dados = analise.data;

  let valorPrincipal: Dinheiro;
  let taxaInformada: number;
  try {
    valorPrincipal = Dinheiro.deTextoBrasileiro(dados.valorPrincipal);
    taxaInformada = taxaDoFormulario(dados.taxa);
  } catch {
    return { mensagem: "Valor ou taxa em formato inválido.", campos: { valorPrincipal: ["Use o formato 12.000,00."] } };
  }
  if (!valorPrincipal.ehPositivo()) {
    return { mensagem: "O valor contratado precisa ser maior que zero.", campos: { valorPrincipal: ["Informe o valor."] } };
  }

  // A taxa e guardada SEMPRE ao mes: uma so unidade no banco evita comparar
  // 2% a.m. com 24% a.a. como se fossem a mesma coisa.
  const taxaMensal =
    dados.baseDaTaxa === "anual"
      ? Number(((Math.pow(1 + taxaInformada / 100, 1 / 12) - 1) * 100).toFixed(6))
      : taxaInformada;

  const primeiroVencimento = dataCivilDeTexto(dados.primeiroVencimento) as DataVencimento;

  let cronograma: readonly ParcelaDoCronograma[];
  try {
    cronograma = lerCronogramaDoFormulario(formulario) ?? gerarCronograma({
      valorPrincipal,
      taxaMensal,
      quantidadeParcelas: dados.quantidadeParcelas,
      primeiroVencimento,
      sistema: dados.sistema,
    });
    validarCronograma(cronograma, valorPrincipal);
  } catch (erro) {
    return { mensagem: erro instanceof Error ? erro.message : "Não foi possível montar o cronograma." };
  }

  let dividaId: string;
  try {
    const criada = await repositorios.dividas().criar(
      escopo,
      {
        credorPessoaId: dados.credorPessoaId,
        tipo: dados.tipo,
        descricao: dados.descricao,
        ...(dados.numeroContrato ? { numeroContrato: dados.numeroContrato } : {}),
        dataContratacao: dataCivilDeTexto(dados.dataContratacao),
        valorPrincipal,
        taxaMensal,
        sistema: dados.sistema,
        categoriaJurosId: dados.categoriaJurosId,
        ...(dados.contaBancariaCreditoId ? { contaBancariaCreditoId: dados.contaBancariaCreditoId } : {}),
        ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
        usuarioId,
      },
      cronograma,
    );
    dividaId = criada.dividaId;
  } catch (erro) {
    logs.erro("falha ao criar divida", { erro });
    return { mensagem: erro instanceof Error ? erro.message : "Não foi possível registrar a dívida." };
  }

  revalidatePath("/dividas");
  revalidatePath("/contas-pagar");
  revalidatePath("/fluxo-de-caixa");
  redirect(`/dividas/${dividaId}`);
}

/**
 * Le a previa conferida na tela.
 *
 * Retorna `null` quando nao ha linhas — o caminho sem JavaScript — para o
 * chamador cair no cronograma calculado no servidor.
 */
function lerCronogramaDoFormulario(formulario: FormData): readonly ParcelaDoCronograma[] | null {
  const vencimentos = formulario.getAll("parcelaVencimento").filter((v): v is string => typeof v === "string");
  const amortizacoes = formulario.getAll("parcelaAmortizacao").filter((v): v is string => typeof v === "string");
  const juros = formulario.getAll("parcelaJuros").filter((v): v is string => typeof v === "string");

  if (vencimentos.length === 0) return null;
  if (vencimentos.length !== amortizacoes.length || vencimentos.length !== juros.length) {
    throw new Error("O cronograma chegou incompleto. Recarregue a página e tente de novo.");
  }

  let saldo = Dinheiro.zero();
  const parcelas = vencimentos.map((vencimento, indice) => {
    const valorAmortizacao = Dinheiro.deTextoBrasileiro(amortizacoes[indice]!);
    const valorJuros = Dinheiro.deTextoBrasileiro(juros[indice]!);
    saldo = saldo.somar(valorAmortizacao);
    return {
      numero: indice + 1,
      dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento,
      valorAmortizacao,
      valorJuros,
      valorTotal: valorAmortizacao.somar(valorJuros),
      // Preenchido abaixo, quando o total amortizado ja e conhecido.
      saldoDevedor: Dinheiro.zero(),
    };
  });

  let restante = saldo;
  return parcelas.map((parcela) => {
    restante = restante.subtrair(parcela.valorAmortizacao);
    return { ...parcela, saldoDevedor: restante };
  });
}

/**
 * Cancela a divida e as parcelas que AINDA NAO foram pagas.
 *
 * O que ja foi pago continua pago: o dinheiro saiu do banco de verdade, e
 * apagar isso deixaria o extrato sem contrapartida. Exige `dividas.editar` —
 * o catalogo nao tem `dividas.cancelar`, e nenhuma permissao e criada por
 * conta propria (ver relatorio de entrega).
 */
export async function acaoCancelarDivida(_anterior: EstadoDivida, formulario: FormData): Promise<EstadoDivida> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("dividas.editar", "/dividas");

  const analise = esquemaCancelar.safeParse({
    dividaId: texto(formulario, "dividaId"),
    motivo: texto(formulario, "motivo"),
  });
  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }

  try {
    await repositorios.dividas().cancelar(escopo, analise.data.dividaId, { motivo: analise.data.motivo, usuarioId });
  } catch (erro) {
    logs.erro("falha ao cancelar divida", { erro });
    return { mensagem: erro instanceof Error ? erro.message : "Não foi possível cancelar a dívida." };
  }

  revalidatePath("/dividas");
  revalidatePath(`/dividas/${analise.data.dividaId}`);
  revalidatePath("/contas-pagar");
  revalidatePath("/fluxo-de-caixa");
  return {};
}
