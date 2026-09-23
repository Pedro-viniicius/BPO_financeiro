"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ehErroDominio } from "@/compartilhado/erros/indice";
import { CredenciaisBetterAuth } from "@/nucleo/autenticacao/publico";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "@/nucleo/autenticacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { RepositorioGestaoDeUsuariosDrizzle } from "@/nucleo/empresas/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

const logs = criarRegistradorLogs("convite");

export interface EstadoConvite {
  readonly mensagem?: string;
  readonly campos?: Record<string, readonly string[]>;
}

const esquema = z
  .object({
    token: z.string().min(10),
    nome: z.string().trim().min(2, "Informe seu nome.").max(120),
    senha: z
      .string()
      .min(TAMANHO_MINIMO_SENHA, `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
      .max(TAMANHO_MAXIMO_SENHA),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: "As duas senhas não são iguais.",
    path: ["confirmacao"],
  });

/**
 * Aceita o convite: a pessoa define a PROPRIA senha.
 *
 * O sistema nunca cria senha para ninguem, e nunca mostra nem envia uma. O que
 * viaja e um link de uso unico; a senha nasce aqui, digitada por quem vai
 * usa-la, e nunca passa por e-mail nem por conversa.
 */
export async function acaoAceitarConvite(_anterior: EstadoConvite, formulario: FormData): Promise<EstadoConvite> {
  const analise = esquema.safeParse({
    token: formulario.get("token"),
    nome: formulario.get("nome"),
    senha: formulario.get("senha"),
    confirmacao: formulario.get("confirmacao"),
  });

  if (!analise.success) {
    return { mensagem: "Confira os campos destacados.", campos: analise.error.flatten().fieldErrors };
  }

  try {
    const repositorio = new RepositorioGestaoDeUsuariosDrizzle(obterBancoDados(), new CredenciaisBetterAuth());
    await repositorio.aceitarConvite(analise.data.token, { nome: analise.data.nome, senha: analise.data.senha });
  } catch (erro) {
    if (ehErroDominio(erro)) return { mensagem: erro.message };
    logs.erro("falha ao aceitar convite", { erro });
    return { mensagem: "Não foi possível concluir o convite. Peça um novo link a quem administra o sistema." };
  }

  // Entrar e um ato proprio: a pessoa acabou de escolher a senha e a usa agora.
  redirect("/entrar?convite=aceito");
}
