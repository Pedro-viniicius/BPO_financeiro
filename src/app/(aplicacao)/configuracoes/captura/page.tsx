import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import { situacaoDoQr } from "@/modulos/captura-documentos/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioQr } from "./formulario";

export const metadata: Metadata = { title: "Envio de documentos por QR code" };

/** Instante tecnico mostrado no fuso da empresa, como na tela de usuarios. */
const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/**
 * Gerar e revogar o QR code da empresa.
 *
 * Exige `captura.gerenciar_qr` (so administrador): gerar QR e distribuir uma
 * credencial de ESCRITA para fora da empresa.
 */
export default async function PaginaCaptura() {
  const { escopo, nomeEmpresa } = await exigirContextoFinanceiro("captura.gerenciar_qr", "/configuracoes/captura");
  const ativo = await situacaoDoQr(
    { repositorio: repositorios.captura(), aplicacaoUrl: obterVariaveisAmbiente().APLICACAO_URL },
    escopo,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Envio de documentos por QR code"
        descricao={`O QR que o cliente escaneia para mandar nota, recibo e boleto para a fila de conferência · ${nomeEmpresa}`}
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes">Voltar para Configurações</Link>}
      />

      <Aviso tom="informacao" titulo="Como funciona">
        Imprima o QR e deixe no balcão, ou envie por mensagem. Quem escanear abre uma página sem login, fotografa o
        documento e envia. O envio entra na fila de conferência já vinculado a esta empresa — e só entra: quem tem o
        QR não vê nada do que já foi enviado.
      </Aviso>

      <FormularioQr
        situacao={{
          ativoDesde: ativo ? FORMATO_DATA.format(ativo.criadoEm) : null,
          limiteEnviosHora: ativo?.limiteEnviosHora ?? null,
          nomeEmpresa,
        }}
      />
    </>
  );
}
