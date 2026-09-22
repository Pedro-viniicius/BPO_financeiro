import type { Metadata } from "next";
import Link from "next/link";

import { formatarDataBrasileira, formatarDinheiro, tomDaSituacao } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { NOMES_SITUACAO_RECEBER, type SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { Botao, CabecalhoPagina, CartaoRegistro, EstadoVazio, SeloSituacao } from "@/interface/componentes/indice";

import { TabelaSimples } from "../_apoio/tabela-simples";
import estilos from "./lista.module.css";

export const metadata: Metadata = { title: "Contas a pagar" };

const SITUACOES: readonly SituacaoDerivada[] = ["aberta", "parcial", "vencida", "liquidada", "cancelada"];

/**
 * A1 — Contas a pagar. Responde "o que devo pagar, e quando?".
 *
 * `exigirContextoFinanceiro` faz a verificacao no SERVIDOR antes de qualquer
 * leitura: sessao, empresa ativa, vinculo ativo e a permissao de visualizar.
 * Esconder o item do menu nunca foi controle de acesso.
 */
export default async function PaginaContasReceber({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("contas_receber.visualizar", "/contas-receber");
  const parametros = await searchParams;
  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const situacao = texto("situacao") as SituacaoDerivada | undefined;
  const filtro = {
    ...(texto("busca") ? { busca: texto("busca")! } : {}),
    ...(situacao ? { situacoes: [situacao] } : {}),
    ...(texto("de") ? { vencimentoDe: texto("de")! as never } : {}),
    ...(texto("ate") ? { vencimentoAte: texto("ate")! as never } : {}),
    ...(texto("cliente") ? { clienteId: texto("cliente")! } : {}),
  };
  const temFiltro = Object.keys(filtro).length > 0;

  const [pagina, clientees] = await Promise.all([
    repositorios.contasReceber().listar(escopo, filtro, { pagina: 1, tamanho: 100 }, hoje),
    repositorios.cadastros().listarClientes(escopo),
  ]);

  const emAberto = pagina.itens.filter((i) => i.situacao !== "liquidada" && i.situacao !== "cancelada");
  const totalAberto = Dinheiro.somarTodos(emAberto.map((i) => i.saldo));
  const totalVencido = Dinheiro.somarTodos(pagina.itens.filter((i) => i.situacao === "vencida").map((i) => i.saldo));
  const podeCriar = permissoes.has("contas_receber.criar");

  return (
    <>
      <CabecalhoPagina
        titulo="Contas a pagar"
        descricao="Compromissos com clientees, impostos e serviços"
        acaoPrimaria={podeCriar ? <Link className="acao-primaria" href="/contas-receber/nova">Nova conta a pagar</Link> : null}
      />

      {pagina.itens.length > 0 ? (
        <div className={estilos.resumo}>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Em aberto</span>
            <span className={`${estilos.resumoValor} numero-tabular`}>{formatarDinheiro(totalAberto)}</span>
          </span>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Vencido</span>
            <span className={`${estilos.resumoValor} ${estilos.vencido} numero-tabular`}>{formatarDinheiro(totalVencido)}</span>
          </span>
          <span className={estilos.resumoItem}>
            <span className={estilos.resumoRotulo}>Contas listadas</span>
            <span className={estilos.resumoValor}>{pagina.itens.length}</span>
          </span>
        </div>
      ) : null}

      <form className={estilos.barra} method="get">
        <label className={`${estilos.campo} ${estilos.crescer}`}>
          Buscar
          <input type="search" name="busca" defaultValue={texto("busca") ?? ""} placeholder="Descrição, código ou cliente" />
        </label>
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
          até
          <input type="date" name="ate" defaultValue={texto("ate") ?? ""} />
        </label>
        <label className={estilos.campo}>
          Cliente
          <select name="cliente" defaultValue={texto("cliente") ?? ""}>
            <option value="">Todos</option>
            {clientees.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </label>
        <Botao type="submit" variante="secundario">Filtrar</Botao>
        {temFiltro ? <Link className="acao-secundaria" href="/contas-receber">Limpar</Link> : null}
      </form>

      {pagina.itens.length === 0 ? (
        temFiltro ? (
          <EstadoVazio
            motivo="filtrado"
            titulo="Nenhuma conta encontrada com esses filtros"
            explicacao="Tente ampliar o período de vencimento ou limpar a busca."
            acao={<Link className="acao-secundaria" href="/contas-receber">Limpar filtros</Link>}
          />
        ) : (
          <EstadoVazio
            titulo="Ainda não há contas a pagar"
            explicacao="Cadastre a primeira conta para começar a acompanhar o que a empresa tem a receber."
            acao={podeCriar ? <Link className="acao-primaria" href="/contas-receber/nova">Nova conta a pagar</Link> : null}
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
                { chave: "vencimento", titulo: "Vencimento" },
                { chave: "valor", titulo: "Valor", alinhamento: "direita" },
                { chave: "baixado", titulo: "Recebido", alinhamento: "direita" },
                { chave: "saldo", titulo: "Saldo", alinhamento: "direita" },
                { chave: "situacao", titulo: "Situação" },
              ]}
              linhas={pagina.itens.map((i) => ({
                chave: i.parcelaId,
                celulas: {
                  descricao: { tipo: "link" as const, texto: i.descricao, rota: `/contas-receber/${i.parcelaId}` },
                  pessoa: i.clienteNome,
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
            {pagina.itens.map((item) => (
              <CartaoRegistro
                key={item.parcelaId}
                nome={item.descricao}
                complemento={item.clienteNome}
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
        </>
      )}
    </>
  );
}
