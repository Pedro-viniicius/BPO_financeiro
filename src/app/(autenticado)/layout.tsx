import type { ReactNode } from "react";

import { CascaSimples } from "@/interface/casca/casca-simples";

/** Telas que exigem sessao mas nao empresa (primeiro acesso). */
export default function LayoutAutenticado({ children }: { children: ReactNode }) {
  return <CascaSimples>{children}</CascaSimples>;
}
