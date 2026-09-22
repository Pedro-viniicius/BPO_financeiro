"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TAMANHO_MAXIMO_ARQUIVO_BYTES } from "@/nucleo/arquivos/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { FORMAS_DE_PAGAMENTO } from "../_apoio/formas-de-pagamento";

const logs = criarRegistradorLogs("conciliacao");

export interface EstadoConciliacao {
  readonly mensagem?: string;
  readonly sucesso?: string;
  /** Preenchido quando a conta do arquivo nao bate: a tela pede confirmacao. */
  readonly pedeConfirmacaoDeConta?: boolean;
  readonly campos?: Readonly<Record<string, string[]>>;
}

const UUID = z.string().uuid();

const esquemaImportacao = z.object({
  contaBancariaId: UUID,
  confirmar: z.string().optional(),
});

const esquemaConciliar = z.object({
  contaBancariaId: UUID,
  itemExtratoId: UUID,
  movimentacaoId: UUID,
});

const esquemaConciliarVarios = z.object({
  contaBancariaId: UUID,
  itemExtratoId: UUID,
});

const esquemaIgnorar = z.object({
  contaBancariaId: UUID,
  itemExtratoId: UUID,
  motivo: z.string().trim().min(5, "Explique por que este lançamento não deve ser conciliado (mínimo 5 letras)."),
});

const esquemaDesconciliar = z.object({
  contaBancariaId: UUID,
  conciliacaoId: UUID,
  motivo: z.string().trim().min(5, "Explique o motivo (mínimo 5 letras)."),
});

const esquemaLancamento = z.object({
  contaBancariaId: UUID,
  itemExtratoId: UUID,
  categoriaId: UUID.describe("categoria"),
});

const esquemaBaixa = z.object({
  contaBancariaId: UUID,
  itemExtratoId: UUID,
  area: z.enum(["pagar", "receber"]),
  parcelaId: UUID,
  formaPagamento: z.enum(FORMAS_DE_PAGAMENTO),
});

const esquemaLote = z.object({ contaBancariaId: UUID });

function campos(erro: z.ZodError): Record<string, string[]> {
  return z.flattenError(erro).fieldErrors as Record<string, string[]>;
}

/** Tipos que um extrato OFX pode chegar. Navegadores rotulam o mesmo arquivo de formas diferentes. */
const TIPOS_OFX_ACEITOS = ["application/x-ofx", "application/ofx", "text/plain", "application/octet-stream", ""];

/**
 * Importar extrato exige `bancos.importar_extrato`.
 *
 * A validacao do arquivo acontece em tres camadas, da mais barata para a mais
 * cara: extensao, tamanho e, so depois, o conteudo (o leitor de OFX recusa o
 * que nao for extrato de verdade). O tipo declarado pelo navegador NAO e
 * confiavel — o mesmo .ofx chega como `application/x-ofx`, `text/plain` ou
 * `application/octet-stream` dependendo do sistema.
 */
export async function acaoImportarExtrato(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.importar_extrato", "/conciliacao");

  const analise = esquemaImportacao.safeParse({
    contaBancariaId: formulario.get("contaBancariaId"),
    confirmar: formulario.get("confirmar") ?? undefined,
  });
  if (!analise.success) return { mensagem: "Escolha a conta bancária." };

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { mensagem: "Escolha o arquivo OFX exportado do banco." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".ofx")) {
    return { mensagem: "O arquivo precisa ter a extensão .ofx. Exporte o extrato no formato OFX / Money." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
    return { mensagem: "O arquivo é grande demais. Exporte um período menor." };
  }
  if (!TIPOS_OFX_ACEITOS.includes(arquivo.type)) {
    return { mensagem: `Tipo de arquivo não aceito (${arquivo.type}). Envie o OFX exportado pelo banco.` };
  }

  let resultado;
  try {
    resultado = await repositorios.conciliacao().importarOfx(escopo, {
      contaBancariaId: analise.data.contaBancariaId,
      nomeArquivo: arquivo.name,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
      usuarioId,
      ...(analise.data.confirmar === "sim" ? { confirmouContaDivergente: true } : {}),
    });
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    if (codigo === "CONTA_DIVERGENTE") {
      return {
        pedeConfirmacaoDeConta: true,
        mensagem:
          "A conta que aparece dentro do arquivo é diferente da conta escolhida. Confira antes de continuar — importar o extrato na conta errada desalinha dois saldos de uma vez.",
      };
    }
    const mensagem = MENSAGENS_DE_RECUSA[codigo];
    if (mensagem) return { mensagem };
    // O leitor de OFX ja devolve frase em portugues; ela vai direto para a tela.
    if (codigo.includes("arquivo") || codigo.includes("OFX") || codigo.includes("lançamento")) return { mensagem: codigo };
    logs.erro("falha ao importar extrato", { erro: codigo });
    return { mensagem: "Não foi possível ler o arquivo agora. Tente novamente em instantes." };
  }

  revalidatePath("/conciliacao");
  const resumo =
    resultado.importados === 0
      ? `Nenhum lançamento novo: os ${resultado.duplicados} do arquivo já tinham sido importados.`
      : `${resultado.importados} ${resultado.importados === 1 ? "lançamento importado" : "lançamentos importados"}${
          resultado.duplicados > 0 ? ` · ${resultado.duplicados} já existiam` : ""
        }.`;
  redirect(`/conciliacao?conta=${analise.data.contaBancariaId}&aviso=${encodeURIComponent(resumo)}`);
}

/** Conciliar exige `bancos.conciliar`. */
export async function acaoConciliar(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaConciliar.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Escolha o lançamento do sistema que corresponde a este item." };

  try {
    await repositorios.conciliacao().conciliar(escopo, {
      contaBancariaId: analise.data.contaBancariaId,
      itensExtratoIds: [analise.data.itemExtratoId],
      movimentacaoIds: [analise.data.movimentacaoId],
      origemDecisao: "sugestao_aceita",
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível conciliar agora. Tente novamente em instantes.");
  }

  return concluir(analise.data.contaBancariaId, "Conciliado.");
}

/** Conciliacao 1:N — varias movimentacoes para um item do extrato. */
export async function acaoConciliarVarios(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaConciliarVarios.safeParse({
    contaBancariaId: formulario.get("contaBancariaId"),
    itemExtratoId: formulario.get("itemExtratoId"),
  });
  if (!analise.success) return { mensagem: "Confira o item selecionado." };

  const movimentacaoIds = formulario.getAll("movimentacaoId").map(String).filter(Boolean);
  if (movimentacaoIds.length === 0) {
    return { mensagem: "Marque pelo menos um lançamento do sistema." };
  }

  try {
    await repositorios.conciliacao().conciliar(escopo, {
      contaBancariaId: analise.data.contaBancariaId,
      itensExtratoIds: [analise.data.itemExtratoId],
      movimentacaoIds,
      origemDecisao: "manual",
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível conciliar agora. Tente novamente em instantes.");
  }

  return concluir(analise.data.contaBancariaId, `Conciliado com ${movimentacaoIds.length} lançamentos.`);
}

/** Aceita de uma vez as sugestoes exatas. Exige `bancos.conciliar`. */
export async function acaoAceitarSugestoesExatas(
  _anterior: EstadoConciliacao,
  formulario: FormData,
): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaLote.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Escolha a conta bancária." };

  let conciliadas = 0;
  try {
    ({ conciliadas } = await repositorios.conciliacao().aceitarSugestoesExatas(
      escopo,
      analise.data.contaBancariaId,
      usuarioId,
    ));
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível conciliar em lote agora.");
  }

  return concluir(
    analise.data.contaBancariaId,
    conciliadas === 0 ? "Nenhuma sugestão exata para aceitar." : `${conciliadas} conciliados.`,
  );
}

export async function acaoDesconciliar(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaDesconciliar.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos.", campos: campos(analise.error) };

  try {
    await repositorios.conciliacao().desconciliar(escopo, analise.data.conciliacaoId, {
      motivo: analise.data.motivo,
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível desfazer agora.");
  }

  return concluir(analise.data.contaBancariaId, "Conciliação desfeita.");
}

export async function acaoIgnorarItem(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaIgnorar.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira os campos.", campos: campos(analise.error) };

  try {
    await repositorios.conciliacao().ignorarItem(escopo, analise.data.itemExtratoId, {
      motivo: analise.data.motivo,
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível ignorar agora.");
  }

  return concluir(analise.data.contaBancariaId, "Lançamento marcado como ignorado.");
}

/**
 * Cria a movimentacao avulsa (tarifa, rendimento) a partir do item.
 *
 * Exige `bancos.conciliar`: e a acao de fechar uma linha do extrato que nao
 * tem contrapartida no sistema, e faz parte do mesmo trabalho de conciliar.
 */
export async function acaoCriarLancamento(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");

  const analise = esquemaLancamento.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Escolha a categoria deste lançamento." };

  try {
    await repositorios.conciliacao().criarLancamentoDoItem(escopo, analise.data.itemExtratoId, {
      categoriaId: analise.data.categoriaId,
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível criar o lançamento agora.");
  }

  return concluir(analise.data.contaBancariaId, "Lançamento criado e conciliado.");
}

/** Da baixa numa parcela a partir do item. Exige a permissao da ÁREA, nao a de conciliar. */
export async function acaoCriarBaixa(_anterior: EstadoConciliacao, formulario: FormData): Promise<EstadoConciliacao> {
  const bruto = Object.fromEntries(formulario.entries());
  const area = bruto.area === "receber" ? "receber" : "pagar";
  // Quem concilia nao ganha, por tabela, o direito de baixar contas: a
  // permissao exigida e a mesma da tela de contas a pagar/receber.
  const { escopo, usuarioId } = await exigirContextoFinanceiro(
    area === "pagar" ? "contas_pagar.pagar" : "contas_receber.baixar",
    "/conciliacao",
  );

  const analise = esquemaBaixa.safeParse(bruto);
  if (!analise.success) return { mensagem: "Escolha a conta e a forma de pagamento." };

  try {
    await repositorios.conciliacao().criarBaixaDoItem(escopo, analise.data.itemExtratoId, {
      area: analise.data.area,
      parcelaId: analise.data.parcelaId,
      formaPagamento: analise.data.formaPagamento,
      usuarioId,
    });
  } catch (erro) {
    return traduzirFalha(erro, "Não foi possível registrar a baixa agora.");
  }

  return concluir(analise.data.contaBancariaId, "Baixa registrada e conciliada.");
}

function concluir(contaBancariaId: string, aviso: string): never {
  revalidatePath("/conciliacao");
  revalidatePath("/bancos");
  revalidatePath("/fluxo-de-caixa");
  redirect(`/conciliacao?conta=${contaBancariaId}&aviso=${encodeURIComponent(aviso)}`);
}

function traduzirFalha(erro: unknown, padrao: string): EstadoConciliacao {
  const codigo = erro instanceof Error ? erro.message : "";
  if (codigo.startsWith("DESEQUILIBRADA:")) return { mensagem: codigo.slice("DESEQUILIBRADA:".length) };
  const mensagem = MENSAGENS_DE_RECUSA[codigo];
  if (mensagem) return { mensagem };
  logs.erro("falha na conciliacao", { erro: codigo });
  return { mensagem: padrao };
}

const MENSAGENS_DE_RECUSA: Record<string, string> = {
  CONTA_BANCARIA_NAO_ENCONTRADA: "Esta conta bancária não foi encontrada.",
  ITEM_NAO_ENCONTRADO: "Este lançamento do extrato não foi encontrado.",
  ITEM_JA_CONCILIADO: "Este lançamento do extrato já está conciliado.",
  ITEM_IGNORADO: "Este lançamento foi marcado como ignorado.",
  ITEM_DE_OUTRA_CONTA: "O lançamento é de outra conta bancária.",
  MOVIMENTACAO_NAO_ENCONTRADA: "Um dos lançamentos escolhidos não está mais disponível. Recarregue a página.",
  SELECAO_VAZIA: "Escolha pelo menos um lançamento de cada lado.",
  CONCILIACAO_NAO_ENCONTRADA: "Esta conciliação não foi encontrada.",
  CONCILIACAO_JA_DESFEITA: "Esta conciliação já foi desfeita.",
  MOTIVO_OBRIGATORIO: "Explique o motivo.",
  CATEGORIA_NAO_ENCONTRADA: "Escolha uma categoria desta empresa.",
  PARCELA_NAO_ENCONTRADA: "Esta conta não foi encontrada.",
  PARCELA_NAO_ESTA_ABERTA: "Esta conta já foi quitada ou cancelada.",
  SENTIDO_INCOMPATIVEL: "Uma entrada do extrato não pode virar baixa de conta a pagar, nem o contrário.",
  VALOR_ACIMA_DO_SALDO: "O valor do extrato passa do saldo que falta nesta conta.",
};
