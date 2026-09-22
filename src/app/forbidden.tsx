import type { Metadata } from "next";
import Link from "next/link";

import { CascaSimples } from "@/interface/casca/casca-simples";
import { EstadoVazio, LigacoesFormularioSimples } from "@/interface/componentes/indice";
import { ROTAS } from "@/nucleo/empresas/publico";

export const metadata: Metadata = { title: "Sem permissão" };

/**
 * Tela de 403, renderizada quando `exigirAcesso()` chama `forbidden()`.
 *
 * O texto diz o que aconteceu sem revelar o que existe do outro lado: nao
 * nomeia a permissao que faltou nem confirma se o registro procurado existe.
 * Quem decide o que a pessoa pode ver e quem administra a empresa, entao o
 * caminho oferecido e esse — nao "tente de novo".
 */
export default function PaginaSemPermissao() {
  return (
    <CascaSimples>
      <EstadoVazio
        titulo="Você não tem acesso a esta área"
        explicacao="Seu perfil nesta empresa não inclui esta operação. Se você precisa dela para trabalhar, peça a quem administra a empresa para revisar as suas permissões."
      />
      <LigacoesFormularioSimples>
        <Link href={ROTAS.inicio}>Voltar para o início</Link>
      </LigacoesFormularioSimples>
    </CascaSimples>
  );
}
