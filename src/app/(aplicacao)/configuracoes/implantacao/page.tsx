import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, SeloSituacao, TituloSecao } from "@/interface/componentes/indice";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { DesfazerLote } from "./formularios";
import estilos from "./implantacao.module.css";

export const metadata: Metadata = { title: "Implantação" };

const FORMATO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * O assistente de implantacao.
 *
 * Ele nao impede pular passos: mostra o estado de cada um e deixa a pessoa ir
 * na ordem que der. Bloquear a sequencia travaria quem esta esperando uma
 * informacao do cliente para preencher um passo do meio — e implantacao real e
 * feita assim, aos pedacos.
 *
 * A ordem existe mesmo assim, e por dependencia: sem data de corte nao se sabe
 * o que e "em aberto"; sem categoria nao se classifica; sem pessoa nao ha para
 * quem lancar.
 */
export default async function PaginaImplantacao() {
  const { escopo } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao");
  const repositorio = repositorios.implantacao();
  const [etapas, lotes] = await Promise.all([repositorio.situacao(escopo), repositorio.listarLotes(escopo)]);

  const faltando = etapas.filter((etapa) => !etapa.concluida);

  return (
    <>
      <CabecalhoPagina
        titulo="Implantação"
        descricao="Trazer para o sistema a situação em que a empresa já estava"
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes">Voltar para Configurações</Link>}
      />

      {faltando.length === 0 ? (
        <Aviso tom="sucesso" titulo="Implantação completa">
          Todos os passos têm dados. A partir daqui, o dia a dia é pelas telas normais.
        </Aviso>
      ) : (
        <Aviso tom="informacao" titulo={`Faltam ${faltando.length} de ${etapas.length} passos`}>
          Você pode fazer na ordem que der — mas cada passo depende do anterior: sem data de corte não se sabe o que
          está “em aberto”, sem categoria não se classifica, e sem cliente ou fornecedor não há para quem lançar.
        </Aviso>
      )}

      <ol className={estilos.passos}>
        {etapas.map((etapa, indice) => (
          <li key={etapa.etapa} className={etapa.concluida ? estilos.concluido : undefined}>
            <span className={estilos.numero} aria-hidden="true">{indice + 1}</span>
            <div className={estilos.corpo}>
              <div className={estilos.titulo}>
                <strong>{etapa.titulo}</strong>
                <SeloSituacao
                  rotulo={etapa.concluida ? "Pronto" : "Pendente"}
                  tom={etapa.concluida ? "sucesso" : "atencao"}
                />
              </div>
              <p className={estilos.explicacao}>{etapa.explicacao}</p>
              <p className={estilos.resumo}>{etapa.resumo}</p>
              <Link className="acao-secundaria" href={etapa.rota}>
                {etapa.concluida ? "Revisar" : "Fazer agora"}
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <TituloSecao
        titulo="Importações feitas"
        explicacao="Cada envio de planilha vira um lote, e pode ser desfeito enquanto nada do que entrou tiver sido usado."
      />
      {lotes.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma planilha importada ainda.</p>
      ) : (
        <ul className={estilos.lotes}>
          {lotes.map((lote) => (
            <li key={lote.id} className={lote.desfeitoEm ? estilos.desfeito : undefined}>
              <div>
                <strong>{lote.arquivoNome}</strong>
                <span className={estilos.detalhe}>
                  {lote.tipo === "pessoas" ? "Clientes e fornecedores" : "Contas em aberto"} ·{" "}
                  {lote.quantidade} linha(s) · {FORMATO.format(lote.criadoEm)} · por {lote.criadoPorNome}
                </span>
                {lote.desfeitoEm ? (
                  <p className={estilos.detalhe}>
                    Desfeito em {FORMATO.format(lote.desfeitoEm)}
                    {lote.motivoDesfazer ? ` — ${lote.motivoDesfazer}` : ""}
                  </p>
                ) : null}
              </div>
              {lote.podeDesfazer ? (
                <DesfazerLote loteId={lote.id} arquivoNome={lote.arquivoNome} quantidade={lote.quantidade} />
              ) : (
                <p className={estilos.detalhe}>{lote.motivoNaoPodeDesfazer}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
