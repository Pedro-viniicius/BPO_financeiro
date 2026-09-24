"use client";

import { useActionState } from "react";

import { svgDoQr } from "@/compartilhado/qr/indice";
import { Aviso, Botao, CodigoQr, Dobra } from "@/interface/componentes/indice";

import { acaoDefinirLimite, acaoGerarQr, acaoRevogarQr, type EstadoQr } from "./acoes";
import estilos from "./captura.module.css";

const INICIAL: EstadoQr = {};

export interface SituacaoDoQrNaTela {
  readonly ativoDesde: string | null;
  readonly limiteEnviosHora: number | null;
  readonly nomeEmpresa: string;
}

/**
 * O QR aparece UMA vez, na resposta da geracao — o banco guarda so o hash.
 * Por isso a resposta vem com o QR grande, o link e o botao de baixar, e o
 * aviso de que nao volta. Tudo funciona sem JavaScript: o formulario e
 * nativo, e o download e um link `data:`.
 */
export function FormularioQr({ situacao }: { readonly situacao: SituacaoDoQrNaTela }) {
  const [gerado, gerar, gerando] = useActionState(acaoGerarQr, INICIAL);
  const [revogado, revogar, revogando] = useActionState(acaoRevogarQr, INICIAL);
  const [limite, definirLimite, definindoLimite] = useActionState(acaoDefinirLimite, INICIAL);
  const rotulo = `QR code de envio de documentos da ${situacao.nomeEmpresa}`;
  const temAtivo = situacao.ativoDesde !== null;

  return (
    <div className={estilos.coluna}>
      {gerado.mensagem ? <Aviso tom="perigo" titulo={gerado.mensagem} urgente>Tente de novo.</Aviso> : null}
      {revogado.mensagem ? <Aviso tom="perigo" titulo={revogado.mensagem} urgente>Tente de novo.</Aviso> : null}
      {revogado.sucesso && !gerado.link ? <Aviso tom="sucesso" titulo={revogado.sucesso} /> : null}
      {limite.mensagem ? <Aviso tom="perigo" titulo={limite.mensagem} urgente>Corrija e tente de novo.</Aviso> : null}
      {limite.sucesso ? <Aviso tom="sucesso" titulo={limite.sucesso} /> : null}

      {gerado.link && gerado.matriz ? (
        <section className={estilos.resposta} aria-live="polite">
          <Aviso tom="sucesso" titulo={gerado.sucesso ?? "QR code gerado."}>
            <strong>Salve ou imprima agora.</strong> Este QR não volta a ser exibido: o sistema guarda só uma
            impressão dele. Para obter outro, gere de novo — e o de agora deixa de valer.
          </Aviso>
          <div className={estilos.qrEmDestaque}>
            <CodigoQr matriz={gerado.matriz} rotulo={rotulo} />
          </div>
          <p className={estilos.link}>
            <span>Endereço dentro do QR:</span>
            <code>{gerado.link}</code>
          </p>
          <div className={estilos.acoes}>
            <a
              className="acao-secundaria"
              download={`qr-envio-${situacao.nomeEmpresa.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`}
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoQr(gerado.matriz, rotulo))}`}
            >
              Baixar em SVG
            </a>
          </div>
        </section>
      ) : null}

      <form action={gerar} className={estilos.formulario}>
        <p>
          {temAtivo
            ? `Há um QR code ativo desde ${situacao.ativoDesde}. Gerar outro revoga o atual na hora — o impresso deixa de valer.`
            : "Ainda não há QR code para esta empresa."}
        </p>
        <Botao type="submit" variante={temAtivo ? "secundario" : "primario"} ocupado={gerando} rotuloOcupado="Gerando...">
          {temAtivo ? "Gerar novo QR code (revoga o atual)" : "Gerar QR code"}
        </Botao>
      </form>

      {temAtivo ? (
        <Dobra rotulo="Limite de envios por hora" comCaixa={false}>
          <form action={definirLimite} className={estilos.formulario}>
            <p>
              Quantos envios este QR aceita por hora. Hoje: <strong>{situacao.limiteEnviosHora}</strong>. Serve para
              conter um QR que vazou; um cliente normal manda poucos documentos por dia.
            </p>
            <label className={estilos.confirmacao}>
              <span>Envios por hora (1 a 500)</span>
              <input type="number" name="limite" min={1} max={500} step={1} defaultValue={situacao.limiteEnviosHora ?? 20} required className={estilos.numero} />
            </label>
            <Botao type="submit" variante="secundario" ocupado={definindoLimite} rotuloOcupado="Salvando...">
              Salvar limite
            </Botao>
          </form>
        </Dobra>
      ) : null}

      {temAtivo ? (
        <Dobra rotulo="Revogar o QR code atual" comCaixa={false}>
          <form action={revogar} className={estilos.formulario}>
            <p>
              Quem escanear o QR impresso passará a ver que ele não vale mais. Nenhum documento já recebido é
              afetado.
            </p>
            <label className={estilos.confirmacao}>
              <input type="checkbox" name="confirmo" value="sim" required />
              <span>Entendi que o QR impresso deixa de funcionar imediatamente.</span>
            </label>
            <Botao type="submit" variante="perigo" ocupado={revogando} rotuloOcupado="Revogando...">
              Revogar QR code
            </Botao>
          </form>
        </Dobra>
      ) : null}
    </div>
  );
}
