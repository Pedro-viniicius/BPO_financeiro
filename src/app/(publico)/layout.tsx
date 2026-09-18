import type { ReactNode } from "react";

import { CascaSimples } from "@/interface/casca/casca-simples";

/** Telas publicas: entrar e criar conta. */
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return <CascaSimples>{children}</CascaSimples>;
}
