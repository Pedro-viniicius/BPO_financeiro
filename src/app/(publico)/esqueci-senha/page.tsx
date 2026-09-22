import type { Metadata } from "next";

import { TituloFormularioSimples } from "@/interface/componentes/indice";
import { redirecionarSeJaEntrou, ROTAS } from "@/nucleo/empresas/publico";

import { FormularioEsqueciSenha } from "./formulario-esqueci-senha";

export const metadata: Metadata = { title: "Esqueci minha senha" };

/** Pede o link de redefinicao. Publica; quem ja entrou e levado adiante. */
export default async function PaginaEsqueciSenha() {
  await redirecionarSeJaEntrou(ROTAS.esqueciSenha);

  return (
    <>
      <TituloFormularioSimples
        titulo="Esqueci minha senha"
        descricao="Enviaremos um link para você escolher uma nova senha."
      />
      <FormularioEsqueciSenha rotaEntrar={ROTAS.entrar} />
    </>
  );
}
