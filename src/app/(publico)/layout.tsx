import type { ReactNode } from "react";

import { CascaSimples } from "@/interface/casca/casca-simples";
import { avisoDoAmbiente } from "@/nucleo/configuracao/publico";

/** Telas publicas: entrar e criar conta. */
export default function LayoutPublico({ children }: { children: ReactNode }) {
  const aviso = avisoDoAmbiente();
  return <CascaSimples {...(aviso ? { aviso } : {})}>{children}</CascaSimples>;
}
