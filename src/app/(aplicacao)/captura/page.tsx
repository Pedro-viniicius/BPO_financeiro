import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, EstadoVazio } from "@/interface/componentes/indice";
import { AVISO_PENDENTE_DIAS, NOMES_SITUACAO_DOCUMENTO, type SituacaoDocumento } from "@/modulos/captura-documentos/publico";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { TabelaSimples } from "../_apoio/tabela-simples";
import { FORMATO_INSTANTE, TOM_DA_SITUACAO } from "./_apoio";
import estilos from "./captura.module.css";

export const metadata: Metadata = { title: "Documentos recebidos" };

const SITUACOES = Object.keys(NOMES_SITUACAO_DOCUMENTO) as SituacaoDocumento[];
const POR_PAGINA = 50;

/** Instante antes do qual um pendente e "antigo". Fora do componente: relogio nao se le durante a renderizacao. */
function limiteDeAntiguidade(): Date {
  return new Date(Date.now() - AVISO_PENDENTE_DIAS * 24 * 60 * 60 * 1000);
}

/**
 * A fila de conferencia. Pendentes por padrao, do mais antigo para o mais
 * novo — e o mais antigo que esta esperando ha mais tempo. Visualizar nunca
 * muda estado: abrir, olhar e fechar deixa tudo como estava.
 */
export default async function PaginaFila({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { escopo } = await exigirContextoFinanceiro("captura.visualizar", "/captura");
  const parametros = await searchParams;
  const pedida = typeof parametros.situacao === "string" ? parametros.situacao : "pendente_conferencia";
  const situacao = pedida === "todas" ? undefined : ((SITUACOES as string[]).includes(pedida) ? (pedida as SituacaoDocumento) : "pendente_conferencia");
  const pagina = Math.max(1, Number(parametros.pagina) || 1);

  const repositorio = repositorios.captura();
  const antesDe = limiteDeAntiguidade();
  const [resultado, antigos] = await Promise.all([
    repositorio.listarDocumentos(escopo, { ...(situacao ? { situacao } : {}), pagina, porPagina: POR_PAGINA }),
    repositorio.contarPendentesAntigos(escopo, antesDe),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA));

  return (
    <>
      <CabecalhoPagina
        titulo="Documentos recebidos"
        descricao="Notas, recibos e boletos enviados pelo QR code. Confira, classifique e aprove — a conta a pagar nasce na aprovação."
      />

      {antigos > 0 ? (
        <Aviso tom="atencao" titulo={`${antigos} pendente${antigos > 1 ? "s" : ""} há mais de ${AVISO_PENDENTE_DIAS} dias`}>
          Fila que só cresce é fila que ninguém olha. Aos 90 dias sem conferência o documento é arquivado automaticamente.
        </Aviso>
      ) : null}

      <form method="get" action="/captura" className={estilos.filtros}>
        <label>
          Situação
          <select name="situacao" defaultValue={situacao ?? "todas"}>
            {SITUACOES.map((s) => <option key={s} value={s}>{NOMES_SITUACAO_DOCUMENTO[s]}</option>)}
            <option value="todas">Todas</option>
          </select>
        </label>
        <button type="submit" className="acao-secundaria">Filtrar</button>
      </form>

      {resultado.itens.length === 0 ? (
        <EstadoVazio
          titulo={situacao === "pendente_conferencia" || !situacao ? "Nenhum documento à espera de conferência" : "Nenhum documento nesta situação"}
          explicacao="Quando alguém escanear o QR code da empresa e enviar uma nota, um recibo ou um boleto, ele aparece aqui."
          acao={<Link className="acao-secundaria" href="/configuracoes/captura">Ver o QR code da empresa</Link>}
        />
      ) : (
        <>
          <TabelaSimples
            legenda="Documentos recebidos"
            colunas={[
              { chave: "codigo", titulo: "Protocolo" },
              { chave: "recebido", titulo: "Recebido em" },
              { chave: "anexos", titulo: "Arquivos", alinhamento: "direita" },
              { chave: "observacao", titulo: "Observação de quem enviou" },
              { chave: "situacao", titulo: "Situação" },
            ]}
            linhas={resultado.itens.map((item) => ({
              chave: item.id,
              celulas: {
                codigo: { tipo: "link" as const, texto: item.codigo, rota: `/captura/${item.id}` },
                recebido: FORMATO_INSTANTE.format(item.criadoEm),
                anexos: String(item.quantidadeAnexos),
                observacao: item.observacao ?? "—",
                situacao: { tipo: "selo" as const, rotulo: NOMES_SITUACAO_DOCUMENTO[item.situacao], tom: TOM_DA_SITUACAO[item.situacao] },
              },
            }))}
          />
          {totalPaginas > 1 ? (
            <nav className={estilos.paginacao} aria-label="Páginas">
              {pagina > 1 ? <Link href={`/captura?situacao=${situacao ?? "todas"}&pagina=${pagina - 1}`}>Anteriores</Link> : <span />}
              <span>Página {pagina} de {totalPaginas}</span>
              {pagina < totalPaginas ? <Link href={`/captura?situacao=${situacao ?? "todas"}&pagina=${pagina + 1}`}>Próximos</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
