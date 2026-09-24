import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, LigacoesFormularioSimples, TituloFormularioSimples } from "@/interface/componentes/indice";
import { FORMATO_PROTOCOLO } from "@/modulos/captura-documentos/publico";

import estilos from "../envio.module.css";

export const metadata: Metadata = { title: "Documento recebido", robots: { index: false, follow: false } };

/**
 * Confirmacao para quem enviou. Mostra so o protocolo — e so se tiver o
 * formato certo: esta pagina nao consulta nada, entao nao ha o que vazar.
 */
export default async function PaginaRecebido({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { protocolo } = await searchParams;
  const codigo = typeof protocolo === "string" && FORMATO_PROTOCOLO.test(protocolo) ? protocolo : null;

  return (
    <>
      <TituloFormularioSimples titulo="Documento recebido" descricao="Ele entrou na fila de conferência da empresa." />
      {codigo ? (
        <>
          <p>Anote o protocolo, caso precise falar sobre este envio:</p>
          <strong className={estilos.protocolo}>{codigo}</strong>
        </>
      ) : (
        <Aviso tom="informacao" titulo="Envio registrado" />
      )}
      <LigacoesFormularioSimples>
        <Link href={`/enviar/${token}`}>Enviar outro documento</Link>
      </LigacoesFormularioSimples>
    </>
  );
}
