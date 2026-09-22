"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  distribuirNoAno,
  MESES_DO_ANO,
  reajustar,
  repetirNosDozeMeses,
  type ValorPlanejado,
} from "@/modulos/orcamento/publico";
import { REGIMES, type Regime } from "@/modulos/dre/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("orcamento");

export interface EstadoOrcamento {
  readonly mensagem?: string;
  readonly sucesso?: string;
}

const ANO = z.coerce.number().int().min(2000).max(2200);

const esquemaGrade = z.object({ ano: ANO });

const esquemaBase = z.object({
  ano: ANO,
  origem: z.enum(["planejado_anterior", "realizado_anterior"]),
  regime: z.enum(REGIMES as unknown as [Regime, ...Regime[]]).default("caixa"),
  reajuste: z.string().optional(),
});

const esquemaLinha = z.object({
  ano: ANO,
  categoriaId: z.string().uuid(),
  valorBase: z.string().min(1, "Informe o valor."),
  acao: z.enum(["repetir", "distribuir"]),
});

function dinheiroDoFormulario(texto: string | undefined): Dinheiro {
  if (!texto || !texto.trim()) return Dinheiro.zero();
  return Dinheiro.deTextoBrasileiro(texto);
}

function percentualDoFormulario(texto: string | undefined): number {
  if (!texto || !texto.trim()) return 0;
  const numero = Number(texto.trim().replace("%", "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Grava a grade inteira. Exige `orcamento.editar`.
 *
 * Os campos chegam como `celula-<categoriaId>-<mes>`. Uma celula em branco
 * vale zero, e zero APAGA a celula no repositorio — "nao orcado" e diferente
 * de "orcado em zero": so o segundo gera estouro a cada centavo gasto.
 */
export async function acaoSalvarPlanejamento(_anterior: EstadoOrcamento, formulario: FormData): Promise<EstadoOrcamento> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("orcamento.editar", "/orcamento");

  const analise = esquemaGrade.safeParse({ ano: formulario.get("ano") });
  if (!analise.success) return { mensagem: "Ano inválido." };

  const valores: ValorPlanejado[] = [];
  try {
    for (const [chave, bruto] of formulario.entries()) {
      const achado = /^celula-([0-9a-f-]{36})-(\d{1,2})$/.exec(chave);
      if (!achado) continue;
      const mes = Number(achado[2]);
      if (mes < 1 || mes > MESES_DO_ANO) continue;
      valores.push({ categoriaId: achado[1]!, mes, valor: dinheiroDoFormulario(String(bruto)) });
    }
  } catch {
    return { mensagem: "Há um valor inválido na grade. Use apenas números, com vírgula nos centavos." };
  }

  try {
    await repositorios.orcamento().salvarPlanejamento(escopo, analise.data.ano, valores, usuarioId);
  } catch (erro) {
    logs.erro("falha ao salvar orcamento", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível salvar agora. Tente novamente em instantes." };
  }

  return concluir(analise.data.ano, "Orçamento salvo.");
}

/**
 * Preenche a grade a partir do ano anterior — pelo PLANEJADO ou pelo
 * REALIZADO, com reajuste opcional.
 *
 * Partir do realizado e o atalho mais util do orcamento: quase ninguem comeca
 * de uma folha em branco, e o que a empresa gastou de verdade no ano passado e
 * a melhor estimativa disponivel do que vai gastar no proximo.
 */
export async function acaoUsarComoBase(_anterior: EstadoOrcamento, formulario: FormData): Promise<EstadoOrcamento> {
  const { escopo, hoje, usuarioId } = await exigirContextoFinanceiro("orcamento.editar", "/orcamento");

  const analise = esquemaBase.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Confira o ano e a origem." };

  const repositorio = repositorios.orcamento();
  const { ano, origem, regime } = analise.data;

  try {
    const base =
      origem === "planejado_anterior"
        ? await repositorio.planejadoDoAnoAnterior(escopo, ano)
        : await repositorio.realizadoDoAnoAnterior(escopo, ano, regime, hoje);

    if (base.length === 0) {
      return {
        mensagem:
          origem === "planejado_anterior"
            ? `Não há orçamento gravado em ${ano - 1} para copiar.`
            : `Não há nada realizado em ${ano - 1} para usar como base.`,
      };
    }

    const percentual = percentualDoFormulario(analise.data.reajuste);
    const comReajuste = base.map((valor) => ({
      ...valor,
      valor: percentual === 0 ? valor.valor : reajustar([valor.valor], percentual)[0]!,
    }));

    await repositorio.salvarPlanejamento(escopo, ano, comReajuste, usuarioId);
  } catch (erro) {
    logs.erro("falha ao usar base no orcamento", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível preencher agora. Tente novamente em instantes." };
  }

  const rotulo = origem === "planejado_anterior" ? "orçamento" : "realizado";
  return concluir(ano, `Grade preenchida com o ${rotulo} de ${ano - 1}.`);
}

/**
 * Repete ou distribui um valor nos doze meses de UMA categoria.
 *
 * Sao dois botoes de envio no mesmo formulario (`name="acao"`), sem
 * JavaScript: preencher doze celulas a mao e o que faz a maioria das empresas
 * desistir de orcar no segundo ano.
 */
export async function acaoPreencherLinha(_anterior: EstadoOrcamento, formulario: FormData): Promise<EstadoOrcamento> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("orcamento.editar", "/orcamento");

  const analise = esquemaLinha.safeParse(Object.fromEntries(formulario.entries()));
  if (!analise.success) return { mensagem: "Informe o valor a repetir ou distribuir." };

  let base: Dinheiro;
  try {
    base = dinheiroDoFormulario(analise.data.valorBase);
  } catch {
    return { mensagem: "Valor inválido. Use apenas números, com vírgula nos centavos." };
  }
  if (!base.ehPositivo()) return { mensagem: "O valor precisa ser maior que zero." };

  const { ano, categoriaId, acao } = analise.data;
  const doAno = acao === "repetir" ? repetirNosDozeMeses(base) : distribuirNoAno(base);

  try {
    const repositorio = repositorios.orcamento();
    // A grade atual e relida e SO a linha da categoria muda: gravar apenas a
    // linha apagaria todo o resto, porque o salvamento reescreve a grade.
    const planejamento = await repositorio.planejamento(escopo, ano);
    const valores: ValorPlanejado[] = planejamento.linhas.flatMap((linha) =>
      (linha.categoriaId === categoriaId ? doAno : linha.porMes).map((valor, indice) => ({
        categoriaId: linha.categoriaId,
        mes: indice + 1,
        valor,
      })),
    );
    await repositorio.salvarPlanejamento(escopo, ano, valores, usuarioId);
  } catch (erro) {
    logs.erro("falha ao preencher linha do orcamento", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Não foi possível preencher agora. Tente novamente em instantes." };
  }

  const comoFoi = acao === "repetir" ? "repetido nos 12 meses" : "distribuído nos 12 meses";
  return concluir(ano, `Valor ${comoFoi}.`);
}

function concluir(ano: number, aviso: string): never {
  revalidatePath("/orcamento");
  revalidatePath("/orcamento/planejar");
  revalidatePath("/inicio");
  redirect(`/orcamento/planejar?ano=${ano}&aviso=${encodeURIComponent(aviso)}`);
}
