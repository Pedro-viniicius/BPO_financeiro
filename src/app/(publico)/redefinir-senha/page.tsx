import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, LigacoesFormularioSimples, TituloFormularioSimples } from "@/interface/componentes/indice";
import { TAMANHO_MINIMO_SENHA } from "@/nucleo/autenticacao/publico";
import { redirecionarSeJaEntrou, ROTAS } from "@/nucleo/empresas/publico";

import { FormularioRedefinirSenha } from "./formulario-redefinir-senha";

export const metadata: Metadata = { title: "Redefinir senha" };

/**
 * Troca a senha com o token recebido por e-mail.
 *
 * O token viaja na query porque e assim que ele chega do e-mail. Ele NAO e
 * validado aqui: quem valida e o Better Auth, no envio do formulario. Validar
 * na abertura da pagina transformaria um pre-carregamento do navegador em
 * consumo do token.
 */
export default async function PaginaRedefinirSenha({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirecionarSeJaEntrou(ROTAS.redefinirSenha);
  const parametros = await searchParams;
  const token = typeof parametros.token === "string" ? parametros.token : "";

  if (!token) {
    return (
      <>
        <TituloFormularioSimples titulo="Redefinir senha" />
        <Aviso tom="perigo" titulo="Link incompleto" urgente>
          Abra o link exatamente como ele chegou no e-mail.
        </Aviso>
        <LigacoesFormularioSimples>
          <Link href={ROTAS.esqueciSenha}>Pedir um novo link</Link>
        </LigacoesFormularioSimples>
      </>
    );
  }

  return (
    <>
      <TituloFormularioSimples titulo="Escolha uma nova senha" descricao="Depois de salvar, entre com a nova senha." />
      <FormularioRedefinirSenha token={token} rotaEsqueciSenha={ROTAS.esqueciSenha} tamanhoMinimoSenha={TAMANHO_MINIMO_SENHA} />
    </>
  );
}
