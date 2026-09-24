import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Aviso, TituloFormularioSimples } from "@/interface/componentes/indice";
import { LimiteDeTentativasExcedido, MENSAGENS_DE_RECUSA, resolverEnvio, type MotivoRecusa } from "@/modulos/captura-documentos/publico";
import { capturaDisponivelNesteAmbiente } from "@/composicao/arquivos";
import { montarDependenciasEnvio } from "@/composicao/captura";

import { FormularioEnvio } from "./formulario-envio";

export const metadata: Metadata = { title: "Enviar documento", robots: { index: false, follow: false } };

/** Mensagens que a rota de recebimento devolve pela URL (`?erro=`), para funcionar sem JavaScript. */
const MENSAGENS: Record<string, string> = {
  ...MENSAGENS_DE_RECUSA,
  falha: "Não foi possível receber o envio. Tente de novo em instantes.",
};

/**
 * Pagina publica de envio (Gate 10). Sem login, sem aplicativo.
 *
 * O token da URL e trocado pelo escopo da empresa ANTES de qualquer outra
 * coisa (ADR-033). Invalido ou revogado dao a mesma resposta: 404 com o
 * aviso de pedir o QR atual. Esta pagina nunca le nada da empresa alem do
 * nome — quem tem o QR so escreve na fila.
 */
export default async function PaginaEnvio({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { erro } = await searchParams;

  if (!capturaDisponivelNesteAmbiente()) {
    return (
      <Aviso tom="atencao" titulo="Envio de documentos desligado neste ambiente" urgente>
        Este é um ambiente de demonstração, sem disco persistente: um documento enviado aqui sumiria no próximo
        deploy. Em produção esta página recebe fotos e PDFs e os coloca na fila de conferência da empresa.
      </Aviso>
    );
  }

  // O IP so do cabecalho do proxy confiavel (ver receber/route.ts); vira HMAC antes de qualquer uso.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  let nomeEmpresa: string;
  try {
    ({ nomeEmpresa } = await resolverEnvio(montarDependenciasEnvio(), token, ip));
  } catch (erro) {
    if (erro instanceof LimiteDeTentativasExcedido) {
      return (
        <Aviso tom="atencao" titulo="Muitas tentativas" urgente>
          {erro.message}
        </Aviso>
      );
    }
    notFound();
  }

  const mensagemDeErro = typeof erro === "string" ? MENSAGENS[erro as MotivoRecusa] : undefined;

  return (
    <>
      <TituloFormularioSimples
        titulo={`Enviar documento para ${nomeEmpresa}`}
        descricao="Fotografe a nota, o recibo ou o boleto. A equipe do financeiro confere e registra."
      />
      {mensagemDeErro ? (
        <Aviso tom="perigo" titulo="O envio não foi aceito" urgente>
          {mensagemDeErro}
        </Aviso>
      ) : null}
      <FormularioEnvio token={token} />
    </>
  );
}
