import type { ReactNode } from "react";

import { CascaSimples } from "@/interface/casca/casca-simples";
import { avisoDoAmbiente } from "@/nucleo/configuracao/publico";

/**
 * Telas que exigem sessao mas nao empresa (primeiro acesso).
 *
 * A faixa de ambiente vem junto, como nas telas de entrada e na casca da
 * aplicacao: e aqui que a pessoa cadastra a primeira empresa, e cadastrar a
 * empresa de verdade numa demonstracao e exatamente o engano que ela evita.
 */
export default function LayoutAutenticado({ children }: { children: ReactNode }) {
  const aviso = avisoDoAmbiente();
  return <CascaSimples {...(aviso ? { aviso } : {})}>{children}</CascaSimples>;
}
