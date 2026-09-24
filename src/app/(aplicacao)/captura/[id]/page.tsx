import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatarData } from "@/interface/formatacao/indice";
import { Aviso, CabecalhoPagina, SeloSituacao, TituloSecao } from "@/interface/componentes/indice";
import { abrirDocumento, DocumentoNaoEncontrado, NOMES_SITUACAO_DOCUMENTO, podeReabrir } from "@/modulos/captura-documentos/publico";

import { categoriasQueClassificamContas } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FORMATO_INSTANTE, tamanhoLegivel, TOM_DA_SITUACAO } from "../_apoio";
import estilos from "../captura.module.css";
import { FormularioAprovacao, FormularioReabertura, FormularioRejeicao } from "./formularios";

export const metadata: Metadata = { title: "Documento recebido" };

/**
 * Detalhe de um documento recebido: os arquivos (sempre como anexo, nunca
 * renderizados), o que quem enviou escreveu, o aviso de duplicidade, e a
 * decisao. Visualizar NUNCA muda estado.
 */
export default async function PaginaDocumento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("captura.visualizar", `/captura/${id}`);

  let documento;
  try {
    documento = await abrirDocumento({ repositorio: repositorios.captura() }, escopo, id);
  } catch (erro) {
    if (erro instanceof DocumentoNaoEncontrado) notFound();
    throw erro;
  }

  const podeConferir = permissoes.has("captura.conferir");
  const podeAprovar = podeConferir && permissoes.has("contas_pagar.criar");
  const pendente = documento.situacao === "pendente_conferencia";

  const cadastros = repositorios.cadastros();
  const [fornecedores, categorias] = pendente && podeConferir
    ? await Promise.all([cadastros.listarFornecedores(escopo), cadastros.listarCategorias(escopo)])
    : [[], []];

  return (
    <>
      <CabecalhoPagina
        titulo={documento.codigo}
        descricao={`Recebido em ${FORMATO_INSTANTE.format(documento.criadoEm)} pelo QR code da empresa`}
        acoesSecundarias={<Link className="acao-secundaria" href="/captura">Voltar para a fila</Link>}
      />

      <dl className={estilos.ficha}>
        <div><dt>Situação</dt><dd><SeloSituacao tom={TOM_DA_SITUACAO[documento.situacao]} rotulo={NOMES_SITUACAO_DOCUMENTO[documento.situacao]} /></dd></div>
        <div><dt>Na fila desde</dt><dd>{FORMATO_INSTANTE.format(documento.entrouNaFilaEm)}</dd></div>
        {documento.chaveAcesso ? <div><dt>Chave de acesso</dt><dd className={estilos.chave}>{documento.chaveAcesso}</dd></div> : null}
        {documento.dataCompetencia ? <div><dt>Competência</dt><dd>{formatarData(documento.dataCompetencia)}</dd></div> : null}
        {documento.conferidoEm ? <div><dt>Conferido em</dt><dd>{FORMATO_INSTANTE.format(documento.conferidoEm)}</dd></div> : null}
        {documento.dataMarcoRetencao ? <div><dt>Guardado até</dt><dd>{formatarData(documento.dataMarcoRetencao)}</dd></div> : null}
        {documento.tituloPagarId ? <div><dt>Conta criada</dt><dd><Link href={`/contas-pagar?busca=${encodeURIComponent(documento.codigo)}`}>Ver no Contas a pagar</Link></dd></div> : null}
      </dl>

      {documento.duplicadoDe ? (
        <Aviso tom="atencao" titulo="Chave de acesso já recebida antes">
          A mesma chave está no documento <Link href={`/captura/${documento.duplicadoDe.id}`}>{documento.duplicadoDe.codigo}</Link>. Pode ser reenvio da mesma nota — confira antes de aprovar duas vezes.
        </Aviso>
      ) : null}

      {documento.motivoRejeicao ? (
        <Aviso tom="perigo" titulo="Rejeitado">
          {documento.motivoRejeicao}
        </Aviso>
      ) : null}

      <TituloSecao titulo={`Arquivos (${documento.anexos.length})`} />
      <ul className={estilos.anexos}>
        {documento.anexos.map((anexo) => (
          <li key={anexo.arquivoId} className={estilos.anexo}>
            {anexo.removido ? (
              <span>{anexo.nomeOriginal} <span className={estilos.anexoDetalhe}>— conteúdo removido no fim do prazo de guarda</span></span>
            ) : (
              <>
                <Link href={`/captura/${documento.id}/arquivo/${anexo.arquivoId}`}>{anexo.nomeOriginal}</Link>
                <span className={estilos.anexoDetalhe}>{anexo.tipoConteudo} · {tamanhoLegivel(anexo.tamanhoBytes)}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      {documento.observacao ? (
        <>
          <TituloSecao titulo="Observação de quem enviou" />
          <p className={estilos.observacao}>{documento.observacao}</p>
        </>
      ) : null}

      {pendente && podeConferir ? (
        <>
          <FormularioAprovacao
            dados={{
              documentoId: documento.id,
              descricaoSugerida: documento.observacao?.slice(0, 120) ?? `Documento ${documento.codigo}`,
              chaveAcesso: documento.chaveAcesso,
              hoje,
              fornecedores,
              categorias: categoriasQueClassificamContas(categorias),
              podeAprovar,
            }}
          />
          <FormularioRejeicao documentoId={documento.id} />
        </>
      ) : null}

      {podeReabrir(documento.situacao) && podeConferir ? <FormularioReabertura documentoId={documento.id} /> : null}
    </>
  );
}
