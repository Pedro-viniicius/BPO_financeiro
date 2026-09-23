import type { Metadata } from "next";
import Link from "next/link";

import { ehErroDominio } from "@/compartilhado/erros/indice";
import { Aviso } from "@/interface/componentes/indice";
import { CredenciaisBetterAuth, DICA_SENHA } from "@/nucleo/autenticacao/publico";
import { NOMES_PAPEIS } from "@/nucleo/autorizacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { RepositorioGestaoDeUsuariosDrizzle, type ConviteParaAceite } from "@/nucleo/empresas/publico";

import { FormularioConvite } from "./formulario";

export const metadata: Metadata = { title: "Convite de acesso" };

/**
 * Tela publica de aceite do convite.
 *
 * Nao exige sessao — quem chega aqui ainda nao tem conta, ou perdeu o acesso.
 * O token vem na URL e e conferido contra o HASH guardado no banco.
 */
export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repositorio = new RepositorioGestaoDeUsuariosDrizzle(obterBancoDados(), new CredenciaisBetterAuth());

  let convite: ConviteParaAceite | null = null;
  let recusa: string | null = null;
  try {
    convite = await repositorio.lerConvitePeloToken(token);
    if (!convite) recusa = "Este convite não existe. Peça um novo link a quem administra o sistema.";
  } catch (erro) {
    recusa = ehErroDominio(erro) ? erro.message : "Não foi possível abrir este convite.";
  }

  if (!convite) {
    return (
      <Aviso tom="perigo" titulo="Convite indisponível" urgente>
        {recusa}
        <p>
          <Link href="/entrar">Ir para a entrada</Link>
        </p>
      </Aviso>
    );
  }

  return (
    <FormularioConvite
      token={token}
      email={convite.email}
      papel={NOMES_PAPEIS[convite.papel]}
      nomeDaEmpresa={convite.nomeDaEmpresa}
      jaTemConta={convite.jaTemConta}
      dicaSenha={DICA_SENHA}
    />
  );
}
