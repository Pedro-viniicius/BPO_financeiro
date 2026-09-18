import type { Metadata } from "next";

import { TituloFormularioSimples } from "@/interface/componentes/indice";
import { exigirSessaoSemEmpresa, ROTAS } from "@/nucleo/empresas/publico";

import { FormularioPrimeiraEmpresa } from "./formulario-primeira-empresa";

export const metadata: Metadata = { title: "Primeiro acesso" };

/**
 * A2 — Primeiro acesso (docs/ux/mapa-telas.md), passo 1: a empresa.
 * Exige sessao e exige NAO ter empresa; quem ja tem vai para /inicio.
 * Contas bancarias, saldos e categorias ficam para o painel "Comece por
 * aqui" dos Gates 6 e 7.
 */
export default async function PaginaPrimeiroAcesso() {
  const sessao = await exigirSessaoSemEmpresa(ROTAS.primeiroAcesso);

  return (
    <>
      <TituloFormularioSimples
        titulo={`Bem-vindo, ${sessao.nome}`}
        descricao="Cadastre a empresa que você vai administrar. Você será o administrador dela."
      />
      <FormularioPrimeiraEmpresa />
    </>
  );
}
