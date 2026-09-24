"use server";

import { revalidatePath } from "next/cache";

import { gerarMatrizQr, type MatrizQr } from "@/compartilhado/qr/indice";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";
import { gerarQrDeCaptura, revogarQrDeCaptura } from "@/modulos/captura-documentos/publico";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";

const logs = criarRegistradorLogs("configuracoes-captura");
const ROTA = "/configuracoes/captura";

export interface EstadoQr {
  readonly mensagem?: string;
  readonly sucesso?: string;
  /** Presentes so na resposta da geracao: o token nao volta a ser exibido. */
  readonly link?: string;
  readonly matriz?: MatrizQr;
}

export async function acaoGerarQr(_anterior: EstadoQr, _formulario: FormData): Promise<EstadoQr> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("captura.gerenciar_qr", ROTA);
  try {
    const resultado = await gerarQrDeCaptura(
      { repositorio: repositorios.captura(), aplicacaoUrl: obterVariaveisAmbiente().APLICACAO_URL },
      escopo,
      usuarioId,
    );
    revalidatePath(ROTA);
    return {
      sucesso: resultado.substituiuAnterior
        ? "Novo QR code gerado. O anterior deixou de valer neste instante."
        : "QR code gerado.",
      link: resultado.link,
      matriz: gerarMatrizQr(resultado.link),
    };
  } catch (erro) {
    logs.erro("falha ao gerar QR de captura", { erro });
    return { mensagem: "Não foi possível gerar o QR code." };
  }
}

export async function acaoRevogarQr(_anterior: EstadoQr, formulario: FormData): Promise<EstadoQr> {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("captura.gerenciar_qr", ROTA);
  if (formulario.get("confirmo") !== "sim") {
    return { mensagem: "Marque a confirmação para revogar." };
  }
  try {
    const havia = await revogarQrDeCaptura(
      { repositorio: repositorios.captura(), aplicacaoUrl: obterVariaveisAmbiente().APLICACAO_URL },
      escopo,
      usuarioId,
    );
    revalidatePath(ROTA);
    return { sucesso: havia ? "QR code revogado. Quem escanear o impresso verá que ele não vale mais." : "Não havia QR code ativo." };
  } catch (erro) {
    logs.erro("falha ao revogar QR de captura", { erro });
    return { mensagem: "Não foi possível revogar o QR code." };
  }
}
