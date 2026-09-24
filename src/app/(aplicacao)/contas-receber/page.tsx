import type { Metadata } from "next";
import Link from "next/link";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { filtroDaUrl } from "../_apoio/filtros-da-url";
import { Paginador, paginaDaUrl, TAMANHO_DA_PAGINA } from "../_apoio/paginador";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { NOMES_SITUACAO_RECEBER, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { Botao, CabecalhoPagina, CartaoRegistro, EstadoVazio, MaisFiltros, SeloSituacao } from "@/interface/componentes/indice";

import { TabelaSimples } from "../_apoio/tabela-simples";
import estilos from "./lista.module.css";

export const metadata: Metadata = { title: "Contas a receber" };

const SITUACOES: readonly SituacaoDerivada[] = ["aberta", "parcial", "vencida", "liquidada", "cancelada"];

/**
 * A2 — Contas a receber. Responde "quanto tenho a receber, e quando?".
 *
 * `exigirContextoFinanceiro` faz a verificacao no SERVIDOR antes de qualquer
 * leitura: sessao, empresa ativa, vinculo ativo e a permissao de visualizar.
 * Esconder o item do menu nunca foi controle de acesso.
 *
 * A lista e paginada NO BANCO, inclusive o filtro por situacao. Os totais do
 * cabecalho falam da pagina que esta na tela, e dizem isso com todas as
 * letras — um total parcial apresentado como total geral e pior do que
 * nenhum total.
 */
export default async function PaginaContasReceber({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("contas_receber.visualizar", "/contas-receber");
  const parametros = await searchParams;
  // Filtro invalido na URL conta como ausente, em vez de derrubar a consulta.
  const texto = (chave: string): string | undefined => filtroDaUrl(parametros, chave);

  const situacao = texto("situacao") as SituacaoDerivada | undefined;
  const filtro = {
    ...(texto("busca") ? { busca: texto("busca")! } : {}),
    ...(situacao ? { situacoes: [situacao] } : {}),
    ...(texto("de") ? { vencimentoDe: texto("de")! as never } : {}),
    ...(texto("ate") ? { vencimentoAte: texto("ate")! as never } : {}),
    ...(texto("cliente") ? { clienteId: texto("cliente")! } : {}),
  };
  const temFiltro = Object.keys(filtro).length > 0;
  const pagina = paginaDaUrl(parametros.pagina);

  const [resultado, clientes] = await Promise.all([
    repositorios.contasReceber().listar(escopo, filtro, { pagina, tamanho: TAMANHO_DA_PAGINA }, hoje),
    repositorios.cadastros().listarClientes(escopo),
  ]);

  const emAberto = resultado.itens.filter((i) => i.situacao !== "liquidada" && i.situacao !== "cancelada");
  const totalAberto = Dinheiro.somarTodos(emAberto.map((i) => i.saldo));
  const totalVencido = Dinheiro.somarTodos(resultado.itens.filter((i) => i.situacao === "vencida").map((i) => i.saldo));
  const podeCriar = permissoes.has("contas_receber.criar");

  /** Os filtros atuais, para o paginador preservar tudo ao trocar de pagina. */
  const filtrosDaUrl: Record<string, string> = {};
  for (const chave of ["busca", "situacao", "de", "ate", "cliente"]) {
    const valor = texto(chave);
    if (valor) filtrosDaUrl[chave] = valor;
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Contas a receber"
        descricao="Vendas e serviços que você tem a receber"
        acaoPrimaria={podeCriar ? <Link className="acao-primaria" href="/contas-receber/nova">Nova conta a receber</Link> : null}
      />

      {resultado.itens.length > 0 ? (
        <div className={estilos.resumo}>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Em aberto nesta página</span>
            <span className={`${estilos.resumoValor} numero-tabular`}>{formatarDinheiro(totalAberto)}</span>
          </span>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Vencido nesta página</span>
            <span className={`${estilos.resumoValor} ${estilos.vencido} numero-tabular`}>{formatarDinheiro(totalVencido)}</span>
          </span>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Contas no filtro</span>
            <span className={estilos.resumoValor}>{resultado.total}</span>
          </span>
        </div>
      ) : null}

      <form className={estilos.barra} method="get">
        <label className={`${estilos.campo} ${estilos.crescer}`}>
          Buscar
          <input type="search" name="busca" defaultValue={texto("busca") ?? ""} placeholder="Descrição, código ou cliente" />
        </label>
        <MaisFiltros ativos={["situacao", "de", "ate", "cliente"].filter((chave) => texto(chave)).length}>
          <label className={estilos.campo}>
            Situação
            <select name="situacao" defaultValue={situacao ?? ""}>
              <option value="">Todas</option>
              {SITUACOES.map((s) => (
                <option key={s} value={s}>{NOMES_SITUACAO_RECEBER[s]}</option>
              ))}
            </select>
          </label>
          <label className={estilos.campo}>
            Vence de
            <input type="date" name="de" defaultValue={texto("de") ?? ""} />
          </label>
          <label className={estilos.campo}>
            Vence até
            <input type="date" name="ate" defaultValue={texto("ate") ?? ""} />
          </label>
          <label className={estilos.campo}>
            Cliente
            <select name="cliente" defaultValue={texto("cliente") ?? ""}>
              <option value="">Todos</option>
              {clientes.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </label>
        </MaisFiltros>
        <Botao type="submit" variante="secundario">Filtrar</Botao>
        {temFiltro ? <Link className="acao-secundaria" href="/contas-receber">Limpar</Link> : null}
      </form>

      {resultado.itens.length === 0 ? (
        temFiltro ? (
          <EstadoVazio
            motivo="filtrado"
            titulo="Nenhuma conta encontrada com esses filtros"
            explicacao="Tente ampliar o período de vencimento ou limpar a busca."
            acao={<Link className="acao-secundaria" href="/contas-receber">Limpar filtros</Link>}
          />
        ) : (
          <EstadoVazio
            titulo="Ainda não há contas a receber"
            explicacao="Cadastre a primeira conta para começar a acompanhar o que entra."
            acao={podeCriar ? <Link className="acao-primaria" href="/contas-receber/nova">Nova conta a receber</Link> : null}
          />
        )
      ) : (
        <>
          <div className={estilos.tabela}>
            <TabelaSimples
              legenda="Contas a receber"
              colunas={[
                { chave: "descricao", titulo: "Descrição" },
                { chave: "pessoa", titulo: "Cliente" },
                { chave: "parcela", titulo: "Parcela" },
                { chave: "vencimento", titulo: "Vencimento" },
                { chave: "valor", titulo: "Valor", alinhamento: "direita" },
                { chave: "baixado", titulo: "Recebido", alinhamento: "direita" },
                { chave: "saldo", titulo: "Saldo", alinhamento: "direita" },
                { chave: "situacao", titulo: "Situação" },
              ]}
              linhas={resultado.itens.map((i) => ({
                chave: i.parcelaId,
                celulas: {
                  descricao: { tipo: "link" as const, texto: i.descricao, rota: `/contas-receber/${i.parcelaId}` },
                  pessoa: i.clienteNome,
                  parcela: i.quantidadeParcelas > 1 ? `${i.numeroParcela}/${i.quantidadeParcelas}` : "Única",
                  vencimento: formatarDataBrasileira(i.dataVencimento),
                  valor: formatarDinheiro(i.valorOriginal),
                  baixado: formatarDinheiro(i.valorRecebido),
                  saldo: formatarDinheiro(i.saldo),
                  situacao: { tipo: "selo" as const, rotulo: NOMES_SITUACAO_RECEBER[i.situacao], tom: tomDaSituacao(i.situacao) },
                },
              }))}
            />
          </div>

          <div className={estilos.cartoes}>
            {resultado.itens.map((item) => (
              <CartaoRegistro
                key={item.parcelaId}
                nome={item.descricao}
                complemento={
                  item.quantidadeParcelas > 1
                    ? `${item.clienteNome} · parcela ${item.numeroParcela}/${item.quantidadeParcelas}`
                    : item.clienteNome
                }
                situacao={<SeloSituacao tom={tomDaSituacao(item.situacao)} rotulo={NOMES_SITUACAO_RECEBER[item.situacao]} />}
                dados={[
                  { rotulo: "Vencimento", valor: formatarDataBrasileira(item.dataVencimento) },
                  { rotulo: "Valor", valor: formatarDinheiro(item.valorOriginal) },
                  { rotulo: "Saldo", valor: formatarDinheiro(item.saldo) },
                ]}
                acoes={<Link href={`/contas-receber/${item.parcelaId}`}>Abrir</Link>}
              />
            ))}
          </div>

          <Paginador
            rota="/contas-receber"
            parametros={filtrosDaUrl}
            pagina={resultado.pagina}
            tamanho={resultado.tamanho}
            total={resultado.total}
            nomeSingular="conta"
            nomePlural="contas"
          />
        </>
      )}
    </>
  );
}
