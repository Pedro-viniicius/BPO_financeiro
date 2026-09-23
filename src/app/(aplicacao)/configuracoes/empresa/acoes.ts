"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { validarCnpj } from "@/compartilhado/validacao/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { RepositorioDadosDaEmpresaDrizzle } from "@/nucleo/empresas/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("configuracoes-empresa");

export interface EstadoEmpresa {
  readonly mensagem?: string;
  readonly sucesso?: string;
  readonly campos?: Record<string, readonly string[]>;
}

/** Tira tudo o que nao e digito: a pessoa digita com ponto, barra e traco. */
const soDigitos = (valor: string | undefined) => (valor ?? "").replace(/\D/g, "");

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
] as const;

const esquema = z.object({
  razaoSocial: z.string().trim().min(2, "Informe a razão social.").max(200),
  nomeFantasia: z.string().trim().max(200).optional(),
  cnpj: z
    .string()
    .optional()
    .refine((valor) => !valor || valor.length === 14, "O CNPJ precisa ter 14 dígitos.")
    // Digitos verificadores: um CNPJ com numero trocado passa no formato e
    // reprova aqui, que e onde o erro aparece antes de virar documento.
    .refine((valor) => !valor || validarCnpj(valor), "CNPJ inválido: confira os dígitos."),
  email: z.string().trim().email("E-mail inválido.").max(200).optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional(),
  cep: z.string().optional().refine((valor) => !valor || valor.length === 8, "O CEP precisa ter 8 dígitos."),
  logradouro: z.string().trim().max(200).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().max(100).optional(),
  municipio: z.string().trim().max(100).optional(),
  uf: z.enum(UFS).optional().or(z.literal("")),
  dataInicioUso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .optional()
    .or(z.literal("")),
});

function texto(formulario: FormData, campo: string): string | undefined {
  const valor = formulario.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

export async function acaoSalvarEmpresa(_anterior: EstadoEmpresa, formulario: FormData): Promise<EstadoEmpresa> {
  const { escopo, usuarioId, hoje } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes/empresa");

  const analise = esquema.safeParse({
    razaoSocial: texto(formulario, "razaoSocial"),
    nomeFantasia: texto(formulario, "nomeFantasia"),
    cnpj: soDigitos(texto(formulario, "cnpj")) || undefined,
    email: texto(formulario, "email") ?? "",
    telefone: texto(formulario, "telefone"),
    cep: soDigitos(texto(formulario, "cep")) || undefined,
    logradouro: texto(formulario, "logradouro"),
    numero: texto(formulario, "numero"),
    complemento: texto(formulario, "complemento"),
    bairro: texto(formulario, "bairro"),
    municipio: texto(formulario, "municipio"),
    uf: (texto(formulario, "uf") ?? "").toUpperCase(),
    dataInicioUso: texto(formulario, "dataInicioUso") ?? "",
  });

  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }
  const dados = analise.data;

  /*
   * A data de corte no futuro nao faz sentido: ela marca quando a empresa
   * COMECOU a usar o sistema, e a carga inicial trabalha para tras a partir
   * dela. Uma data futura faria a carga pedir saldos de um dia que nao chegou.
   */
  if (dados.dataInicioUso && dados.dataInicioUso > hoje) {
    return {
      mensagem: "Confira os campos destacados.",
      campos: { dataInicioUso: ["A data de corte não pode estar no futuro."] },
    };
  }

  try {
    const repositorio = new RepositorioDadosDaEmpresaDrizzle(obterBancoDados());
    await repositorio.salvar(
      escopo,
      {
        razaoSocial: dados.razaoSocial,
        nomeFantasia: dados.nomeFantasia ?? null,
        cnpj: dados.cnpj ?? null,
        email: dados.email || null,
        telefone: dados.telefone ?? null,
        cep: dados.cep ?? null,
        logradouro: dados.logradouro ?? null,
        numero: dados.numero ?? null,
        complemento: dados.complemento ?? null,
        bairro: dados.bairro ?? null,
        municipio: dados.municipio ?? null,
        uf: dados.uf || null,
        dataInicioUso: dados.dataInicioUso ? dataCivilDeTexto(dados.dataInicioUso) : null,
        fusoHorario: "America/Sao_Paulo",
      },
      usuarioId,
    );
  } catch (erro) {
    logs.erro("falha ao salvar dados da empresa", { erro });
    const mensagem = erro instanceof Error ? erro.message : "";
    if (/empresas_cnpj_unico_idx/.test(mensagem)) {
      return { mensagem: "Este CNPJ já está cadastrado em outra empresa do sistema." };
    }
    return { mensagem: "Não foi possível salvar os dados da empresa." };
  }

  revalidatePath("/configuracoes/empresa");
  // O nome aparece no cabecalho de toda tela.
  revalidatePath("/inicio");
  return { sucesso: "Dados da empresa atualizados." };
}
