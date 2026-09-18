"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { esquemaEmail, esquemaTextoCurto } from "@/compartilhado/validacao/esquemas-comuns";
import { criarContaComEmail } from "@/nucleo/autenticacao/publico";
import { destinoPadrao } from "@/nucleo/empresas/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

const logs = criarRegistradorLogs("criar-conta");

export interface EstadoFormularioCriarConta {
  readonly mensagem?: string;
  readonly campos?: Readonly<Record<string, string[]>>;
  readonly valores?: { readonly nome?: string; readonly email?: string };
}

const esquemaNovaConta = z
  .object({
    nome: esquemaTextoCurto,
    email: esquemaEmail,
    senha: z.string().min(10, "A senha precisa ter ao menos 10 caracteres.").max(128, "Maximo de 128 caracteres."),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senha === dados.confirmacao, { path: ["confirmacao"], message: "As senhas nao conferem." });

/** Server action: cria a conta (primeiro usuario) e segue para o primeiro acesso. */
export async function acaoCriarConta(_anterior: EstadoFormularioCriarConta, formulario: FormData): Promise<EstadoFormularioCriarConta> {
  const valores = {
    nome: texto(formulario.get("nome")),
    email: texto(formulario.get("email")).trim().toLowerCase(),
    senha: texto(formulario.get("senha")),
    confirmacao: texto(formulario.get("confirmacao")),
  };
  const validacao = esquemaNovaConta.safeParse(valores);
  if (!validacao.success) {
    const campos: Record<string, string[]> = {};
    for (const problema of validacao.error.issues) {
      (campos[problema.path.join(".") || "formulario"] ??= []).push(problema.message);
    }
    return { mensagem: "Confira os campos destacados.", campos, valores: { nome: valores.nome, email: valores.email } };
  }

  let resultado: Awaited<ReturnType<typeof criarContaComEmail>>;
  try {
    resultado = await criarContaComEmail({ nome: validacao.data.nome, email: validacao.data.email, senha: validacao.data.senha });
  } catch (erro) {
    logs.erro("falha tecnica ao criar conta", { erro: erro instanceof Error ? erro.message : String(erro) });
    return { mensagem: "Nao foi possivel criar a conta agora. Tente novamente em instantes.", valores: { nome: valores.nome, email: valores.email } };
  }
  if (!resultado.sucesso) {
    return { mensagem: resultado.erro.message, valores: { nome: valores.nome, email: valores.email } };
  }
  // Conta nova nunca tem empresa: o proximo passo e sempre o instalador.
  redirect(destinoPadrao("sem_empresa"));
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}
