import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, LigacoesFormularioSimples, TituloFormularioSimples } from "@/interface/componentes/indice";
import { cadastroAberto } from "@/nucleo/autenticacao/publico";
import { redirecionarSeJaEntrou, ROTAS } from "@/nucleo/empresas/publico";

import { DICA_SENHA } from "@/nucleo/autenticacao/publico";

import { FormularioCriarConta } from "./formulario-criar-conta";

export const metadata: Metadata = { title: "Criar conta" };

/**
 * Criacao da conta do primeiro usuario de uma instalacao. Em producao, com
 * usuarios existentes, a tela explica que a entrada e por convite.
 */
export default async function PaginaCriarConta() {
  await redirecionarSeJaEntrou(ROTAS.criarConta);
  const aberto = await cadastroAberto();

  return (
    <>
      <TituloFormularioSimples titulo="Criar conta" descricao="Depois de criar a conta, você cadastra a sua empresa." />
      {aberto ? (
        <FormularioCriarConta dicaSenha={DICA_SENHA} />
      ) : (
        <Aviso tom="informacao" titulo="Esta instalação já tem usuários">
          A entrada de novas pessoas é feita por convite de quem administra o sistema.
        </Aviso>
      )}
      <LigacoesFormularioSimples>
        <span>Já tem conta?</span>
        <Link href={ROTAS.entrar}>Entrar</Link>
      </LigacoesFormularioSimples>
    </>
  );
}
