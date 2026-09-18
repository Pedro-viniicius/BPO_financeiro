import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/interface/estilos/global.css";

export const metadata: Metadata = {
  title: { default: "Financeiro", template: "%s · Financeiro" },
  description: "Gestao financeira para pequenas e medias empresas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Layout raiz: apenas o documento HTML e os estilos globais.
 * A casca (cabecalho + barra lateral) fica no grupo `(aplicacao)`; telas fora
 * da casca — `/entrar`, `/primeiro-acesso` — entram em outro grupo no Gate 5.
 */
export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
