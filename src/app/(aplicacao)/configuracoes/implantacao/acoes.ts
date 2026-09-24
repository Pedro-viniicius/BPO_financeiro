"use server";

import { revalidatePath } from "next/cache";

import { ehErroDominio } from "@/compartilhado/erros/indice";
import { lerCsv } from "@/compartilhado/planilhas/indice";
import {
  MAXIMO_BYTES,
  MAXIMO_LINHAS,
  validarPlanilhaDeContas,
  validarPlanilhaDePessoas,
  type ErroDaLinha,
} from "@/modulos/implantacao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("implantacao");

export interface EstadoImportacao {
  readonly mensagem?: string;
  readonly sucesso?: string;
  readonly erros?: readonly ErroDaLinha[];
  /**
   * A previa: quantas linhas passaram e uma amostra.
   *
   * O conteudo do arquivo volta junto, em `conteudo`, para a confirmacao
   * poder VALIDAR TUDO DE NOVO no servidor. Nada do que o navegador devolve e
   * aceito como ja conferido — a segunda validacao e a que vale.
   */
  readonly previa?: {
    readonly total: number;
    readonly amostra: readonly string[];
    readonly conteudo: string;
    readonly arquivoNome: string;
  };
}

const LIMITES = `Até ${MAXIMO_LINHAS} linhas e ${Math.round(MAXIMO_BYTES / 1024 / 1024)} MB por arquivo.`;

async function lerArquivo(formulario: FormData): Promise<{ nome: string; texto: string } | { erro: string }> {
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo CSV preenchido." };
  }
  if (arquivo.size > MAXIMO_BYTES) {
    return { erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. ${LIMITES} Divida em dois.` };
  }
  if (!/\.csv$/i.test(arquivo.name)) {
    return {
      erro: "Envie o arquivo em CSV. No Excel: Arquivo → Salvar como → “CSV UTF-8 (delimitado por vírgulas)”.",
    };
  }
  return { nome: arquivo.name, texto: await arquivo.text() };
}

function conteudoDoFormulario(formulario: FormData): { nome: string; texto: string } | { erro: string } {
  const texto = formulario.get("conteudo");
  const nome = formulario.get("arquivoNome");
  if (typeof texto !== "string" || !texto.trim() || typeof nome !== "string") {
    return { erro: "A conferência expirou. Envie o arquivo de novo." };
  }
  return { nome, texto };
}

function previa(total: number, amostra: readonly string[], conteudo: string, arquivoNome: string) {
  return { total, amostra, conteudo, arquivoNome };
}

// ------------------------------------------------------------------ pessoas

export async function acaoConferirPessoas(_anterior: EstadoImportacao, formulario: FormData): Promise<EstadoImportacao> {
  await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/pessoas");

  const arquivo = await lerArquivo(formulario);
  if ("erro" in arquivo) return { mensagem: arquivo.erro };

  const planilha = lerCsv(arquivo.texto);
  if (planilha.linhas.length === 0) return { mensagem: "A planilha não tem nenhuma linha preenchida." };
  if (planilha.linhas.length > MAXIMO_LINHAS) {
    return { mensagem: `A planilha tem ${planilha.linhas.length} linhas. ${LIMITES} Divida em dois arquivos.` };
  }

  const { pessoas, erros } = validarPlanilhaDePessoas(planilha.linhas);
  if (erros.length > 0) return { mensagem: `${erros.length} problema(s) encontrado(s). Nada foi importado.`, erros };

  return {
    previa: previa(
      pessoas.length,
      pessoas.slice(0, 5).map((p) => `${p.nome}${p.documento ? ` · ${p.documento}` : ""} — ${[p.ehCliente ? "cliente" : null, p.ehFornecedor ? "fornecedor" : null].filter(Boolean).join(" e ")}`),
      arquivo.texto,
      arquivo.nome,
    ),
  };
}

export async function acaoImportarPessoas(_anterior: EstadoImportacao, formulario: FormData): Promise<EstadoImportacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/pessoas");

  const arquivo = conteudoDoFormulario(formulario);
  if ("erro" in arquivo) return { mensagem: arquivo.erro };

  // VALIDA DE NOVO. O que o navegador devolve nao e aceito como ja conferido.
  const { pessoas, erros } = validarPlanilhaDePessoas(lerCsv(arquivo.texto).linhas);
  if (erros.length > 0) return { mensagem: `${erros.length} problema(s) encontrado(s). Nada foi importado.`, erros };

  try {
    const resultado = await repositorios.implantacao().importarPessoas(escopo, { arquivoNome: arquivo.nome, pessoas }, usuarioId);
    revalidatePath("/configuracoes/implantacao");
    revalidatePath("/cadastros");
    return {
      sucesso:
        `${resultado.criados} cadastro(s) criado(s)` +
        (resultado.reaproveitados > 0
          ? `, e ${resultado.reaproveitados} que já existiam receberam o papel — sem duplicar.`
          : "."),
    };
  } catch (erro) {
    logs.erro("falha ao importar pessoas", { erro });
    return { mensagem: "Não foi possível importar. Nada foi gravado." };
  }
}

// ------------------------------------------------------------------- contas

export async function acaoConferirContas(_anterior: EstadoImportacao, formulario: FormData): Promise<EstadoImportacao> {
  const { escopo } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/contas");

  const arquivo = await lerArquivo(formulario);
  if ("erro" in arquivo) return { mensagem: arquivo.erro };

  const planilha = lerCsv(arquivo.texto);
  if (planilha.linhas.length === 0) return { mensagem: "A planilha não tem nenhuma linha preenchida." };
  if (planilha.linhas.length > MAXIMO_LINHAS) {
    return { mensagem: `A planilha tem ${planilha.linhas.length} linhas. ${LIMITES} Divida em dois arquivos.` };
  }

  const repositorio = repositorios.implantacao();
  const corte = await repositorio.dataDeCorte(escopo);
  if (!corte) {
    return { mensagem: "Defina a data de corte da empresa antes de importar contas: é ela que diz o que é “em aberto”." };
  }

  const { contas, erros } = validarPlanilhaDeContas(planilha.linhas, corte);
  // Só confere contra o banco o que já passou no formato: apontar "categoria
  // inexistente" numa linha cujo valor está ilegível confundiria mais do que ajuda.
  const contraOBanco = erros.length === 0 ? await repositorio.conferirContas(escopo, contas) : [];
  const todos = [...erros, ...contraOBanco].sort((a, b) => a.linha - b.linha);

  if (todos.length > 0) return { mensagem: `${todos.length} problema(s) encontrado(s). Nada foi importado.`, erros: todos };

  return {
    previa: previa(
      contas.length,
      contas.slice(0, 5).map(
        (c) =>
          `${c.tipo === "pagar" ? "A pagar" : "A receber"} · ${c.descricao} · ${c.pessoa} · vence ${c.dataVencimento.split("-").reverse().join("/")} · ${c.valor.subtrair(c.valorPago).formatarBrasileiro()}`,
      ),
      arquivo.texto,
      arquivo.nome,
    ),
  };
}

export async function acaoImportarContas(_anterior: EstadoImportacao, formulario: FormData): Promise<EstadoImportacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/contas");

  const arquivo = conteudoDoFormulario(formulario);
  if ("erro" in arquivo) return { mensagem: arquivo.erro };

  const repositorio = repositorios.implantacao();
  const corte = await repositorio.dataDeCorte(escopo);
  if (!corte) return { mensagem: "Defina a data de corte da empresa antes de importar contas." };

  const { contas, erros } = validarPlanilhaDeContas(lerCsv(arquivo.texto).linhas, corte);
  const contraOBanco = erros.length === 0 ? await repositorio.conferirContas(escopo, contas) : [];
  const todos = [...erros, ...contraOBanco];
  if (todos.length > 0) return { mensagem: `${todos.length} problema(s) encontrado(s). Nada foi importado.`, erros: todos };

  try {
    const resultado = await repositorio.importarContas(escopo, { arquivoNome: arquivo.nome, contas }, usuarioId);
    revalidatePath("/configuracoes/implantacao");
    revalidatePath("/contas-pagar");
    revalidatePath("/contas-receber");
    return { sucesso: `${resultado.criados} conta(s) importada(s).` };
  } catch (erro) {
    logs.erro("falha ao importar contas", { erro });
    return { mensagem: "Não foi possível importar. Nada foi gravado." };
  }
}

// -------------------------------------------------------------------- lotes

export async function acaoDesfazerLote(_anterior: EstadoImportacao, formulario: FormData): Promise<EstadoImportacao> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao");

  const loteId = formulario.get("loteId");
  const motivo = formulario.get("motivo");
  if (typeof loteId !== "string" || typeof motivo !== "string" || motivo.trim().length < 5) {
    return { mensagem: "Escreva o motivo: é ele que explica, depois, por que os dados mudaram." };
  }

  try {
    const { removidos } = await repositorios.implantacao().desfazerLote(escopo, loteId, motivo.trim(), usuarioId);
    revalidatePath("/configuracoes/implantacao");
    revalidatePath("/contas-pagar");
    revalidatePath("/contas-receber");
    revalidatePath("/cadastros");
    return { sucesso: `Lote desfeito: ${removidos} registro(s) removido(s).` };
  } catch (erro) {
    // So erro de DOMINIO chega a tela com a propria mensagem. O resto (banco,
    // rede) fica no log: nome de tabela e de restricao nao sao para a pessoa.
    if (ehErroDominio(erro)) return { mensagem: erro.message };
    logs.erro("falha ao desfazer lote", { erro });
    return { mensagem: "Não foi possível desfazer este lote agora. Tente novamente em instantes." };
  }
}
