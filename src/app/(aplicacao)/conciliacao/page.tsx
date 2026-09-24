import type { Metadata } from "next";
import Link from "next/link";


import { Dobra, Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao, ValorFinanceiro } from "@/interface/componentes/indice";

import { categoriasQueClassificamContas, formatarDataBrasileira, formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import {
  BotaoAceitarExatas,
  BotaoConciliar,
  FormularioBaixa,
  FormularioDesconciliar,
  FormularioIgnorar,
  FormularioImportacao,
  FormularioLancamento,
  FormularioVarios,
} from "./formularios";
import estilos from "./conciliacao.module.css";

export const metadata: Metadata = { title: "Conciliação" };

const NOMES_ORIGEM: Record<string, string> = {
  pagamento: "Pagamento",
  recebimento: "Recebimento",
  transferencia: "Transferência",
  estorno: "Estorno",
  ajuste_manual: "Ajuste de saldo",
  extrato: "Do extrato",
};

/**
 * Conciliação — "o que está no banco bate com o que registrei?".
 *
 * Duas colunas: o que o BANCO diz (itens do extrato importado) e o que o
 * SISTEMA registrou (movimentações ainda não conferidas). O trabalho e ligar
 * as duas.
 *
 * A regra que atravessa a tela inteira: NADA E CONCILIADO SEM CONFIRMACAO. As
 * sugestoes encurtam a decisao — mesmo valor, mesmo sentido, data proxima —
 * mas cada uma precisa de um clique. Quando ha mais de uma candidata, a tela
 * mostra todas e nao destaca nenhuma: duas mensalidades de R$ 500 no mesmo dia
 * sao indistinguiveis pelos dados do extrato, e escolher por conta propria
 * daria certo metade das vezes.
 */
export default async function PaginaConciliacao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("bancos.conciliar", "/conciliacao");
  const parametros = await searchParams;
  const texto = (chave: string): string | undefined => {
    const valor = parametros[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  };

  const contas = await repositorios.bancos().listar(escopo);
  const contaEscolhida = texto("conta") ?? contas[0]?.id;
  // Conferida contra as contas DESTA empresa antes de qualquer consulta: um
  // "?conta=" torto (favorito antigo, link cortado) mostrava a tela de falha
  // do sistema em vez de "Conta não encontrada".
  const contaDaEmpresa = contas.find((conta) => conta.id === contaEscolhida);
  const aviso = texto("aviso");
  const podeImportar = permissoes.has("bancos.importar_extrato");

  if (contas.length === 0) {
    return (
      <>
        <CabecalhoPagina titulo="Conciliação" descricao="Conferir o extrato com os seus lançamentos" />
        <EstadoVazio
          titulo="Cadastre uma conta bancária antes"
          explicacao="A conciliação compara o extrato de uma conta com os lançamentos dela. Sem conta cadastrada, não há o que comparar."
          acao={<Link className="acao-primaria" href="/bancos">Ir para Bancos e caixa</Link>}
        />
      </>
    );
  }

  if (!contaDaEmpresa) {
    return (
      <>
        <CabecalhoPagina titulo="Conciliação" descricao="Conferir o extrato com os seus lançamentos" />
        <EstadoVazio
          titulo="Conta não encontrada"
          explicacao="O endereço aponta para uma conta bancária que não é desta empresa, ou que não existe mais."
          acao={<Link className="acao-primaria" href={`/conciliacao?conta=${contas[0]!.id}`}>Conciliar {contas[0]!.nome}</Link>}
        />
      </>
    );
  }

  const [painel, importacoes, categorias, aPagar, aReceber] = await Promise.all([
    repositorios.conciliacao().montarPainel(escopo, contaEscolhida!, hoje),
    repositorios.conciliacao().listarImportacoes(escopo, contaEscolhida!),
    repositorios.cadastros().listarCategorias(escopo),
    permissoes.has("contas_pagar.pagar")
      ? repositorios.contasPagar().listar(escopo, { situacoes: ["aberta", "parcial", "vencida"] }, { pagina: 1, tamanho: 100 }, hoje)
      : Promise.resolve({ itens: [], total: 0, pagina: 1, tamanho: 0 }),
    permissoes.has("contas_receber.baixar")
      ? repositorios.contasReceber().listar(escopo, { situacoes: ["aberta", "parcial", "vencida"] }, { pagina: 1, tamanho: 100 }, hoje)
      : Promise.resolve({ itens: [], total: 0, pagina: 1, tamanho: 0 }),
  ]);

  if (!painel) {
    return (
      <>
        <CabecalhoPagina titulo="Conciliação" descricao="Conferir o extrato com os seus lançamentos" />
        <EstadoVazio titulo="Conta não encontrada" explicacao="Escolha uma conta bancária desta empresa." />
      </>
    );
  }

  const opcoesDeConta = contas.map((conta) => ({ id: conta.id, nome: conta.nome }));
  const categoriasDeLancamento = categoriasQueClassificamContas(categorias).map((c) => ({ id: c.id, nome: c.nome }));

  const parcelasAPagar = aPagar.itens.map((item) => ({
    id: item.parcelaId,
    rotulo: `${item.codigo} · ${item.descricao} · ${item.fornecedorNome} · falta ${formatarDinheiro(item.saldo)}`,
  }));
  const parcelasAReceber = aReceber.itens.map((item) => ({
    id: item.parcelaId,
    rotulo: `${item.codigo} · ${item.descricao} · ${item.clienteNome} · falta ${formatarDinheiro(item.saldo)}`,
  }));

  const rotuloDaMovimentacao = (movimentacao: (typeof painel.movimentacoes)[number]) =>
    `${formatarDataBrasileira(movimentacao.data)} · ${movimentacao.tipo === "entrada" ? "+" : "−"}${formatarDinheiro(movimentacao.valor)} · ${movimentacao.descricao}`;

  const porId = new Map(painel.movimentacoes.map((m) => [m.id, m]));
  const pendentes = painel.itens.filter((item) => !item.conciliado && !item.ignorado);
  const resolvidos = painel.itens.filter((item) => item.conciliado || item.ignorado);
  const diferenca = painel.resumo.diferenca;

  return (
    <>
      <CabecalhoPagina titulo="Conciliação" descricao={`Extrato × lançamentos de ${painel.contaNome}`} />

      {aviso ? <Aviso tom="sucesso" titulo={aviso} /> : null}

      <form className={estilos.seletor} method="get">
        <label className={estilos.campo}>
          Conta bancária
          <select name="conta" defaultValue={contaEscolhida}>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.nome}</option>
            ))}
          </select>
        </label>
        <button className="acao-secundaria" type="submit">Trocar de conta</button>
      </form>

      <div className={estilos.resumo}>
        <CartaoResumo
          titulo="Saldo segundo o banco"
          valor={
            painel.resumo.saldoDoExtrato ? (
              <ValorFinanceiro valor={painel.resumo.saldoDoExtrato.paraTexto()} tamanho="destaque" comCor={false} />
            ) : (
              <span>—</span>
            )
          }
          explicacao={painel.resumo.saldoDoExtrato ? "Informado no último extrato importado." : "Importe um extrato para comparar."}
        />
        <CartaoResumo
          titulo="Saldo segundo o sistema"
          valor={<ValorFinanceiro valor={painel.resumo.saldoDoSistema.paraTexto()} tamanho="destaque" comCor={false} />}
          explicacao="Na mesma data de fechamento do extrato."
        />
        <CartaoResumo
          titulo="Diferença"
          valor={
            diferenca ? (
              <span className={diferenca.ehZero() ? estilos.diferencaZerada : estilos.diferencaAberta}>
                <ValorFinanceiro valor={diferenca.paraTexto()} tamanho="destaque" />
              </span>
            ) : (
              <span>—</span>
            )
          }
          explicacao={
            diferenca?.ehZero()
              ? "Extrato e sistema batem."
              : "Enquanto houver diferença, algum lançamento está faltando ou sobrando."
          }
          tom={diferenca?.ehZero() ? "sucesso" : "atencao"}
          contagem={`${painel.resumo.itensPendentes} do extrato · ${painel.resumo.movimentacoesPendentes} do sistema pendentes`}
        />
      </div>

      {podeImportar ? (
        <Dobra rotulo="Importar extrato (.ofx)" aberta={!painel.temExtrato} comCaixa={false}>
          <div className={estilos.corpoDobra}>
            <FormularioImportacao contas={opcoesDeConta} contaEscolhida={contaEscolhida!} />

            {importacoes.length > 0 ? (
              <table className={estilos.importacoes}>
                <caption className="apenas-leitor-de-tela">Extratos já importados nesta conta</caption>
                <thead>
                  <tr>
                    <th scope="col">Arquivo</th>
                    <th scope="col">Período</th>
                    <th scope="col">Lançamentos</th>
                    <th scope="col">Importado por</th>
                    <th scope="col">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {importacoes.map((importacao) => (
                    <tr key={importacao.id}>
                      <td>{importacao.nomeArquivo}</td>
                      <td>
                        {importacao.dataInicio && importacao.dataFim
                          ? `${formatarDataBrasileira(importacao.dataInicio)} a ${formatarDataBrasileira(importacao.dataFim)}`
                          : "—"}
                      </td>
                      <td>{importacao.quantidadeItens}</td>
                      <td>{importacao.importadoPorNome ?? "—"}</td>
                      <td>{importacao.importadoEm.toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </Dobra>
      ) : null}

      {!painel.temExtrato ? (
        <EstadoVazio
          titulo="Nenhum extrato importado nesta conta"
          explicacao="Exporte o extrato no aplicativo do banco no formato OFX e envie aqui. A partir daí, a tela mostra lado a lado o que o banco diz e o que você registrou."
        />
      ) : (
        <>
          {painel.resumo.sugestoesExatas > 0 ? (
            <Aviso tom="informacao" titulo={`${painel.resumo.sugestoesExatas} correspondências exatas encontradas`}>
              Mesmo valor, mesma data e sem disputa dos dois lados. Você pode aceitar todas de uma vez ou conferir uma a uma.
              <span className={estilos.acoes}>
                <BotaoAceitarExatas contaBancariaId={contaEscolhida!} quantidade={painel.resumo.sugestoesExatas} />
              </span>
            </Aviso>
          ) : null}

          <div className={estilos.painel}>
            <section className={estilos.coluna} aria-labelledby="titulo-extrato">
              <p className={estilos.tituloColuna}>
                <strong id="titulo-extrato">O que o banco diz</strong>
                <span className={estilos.contagem}>{pendentes.length} pendentes</span>
              </p>

              {pendentes.length === 0 ? (
                <EstadoVazio
                  titulo="Nada pendente no extrato"
                  explicacao="Todos os lançamentos importados já foram conciliados ou ignorados."
                />
              ) : (
                <ul className={estilos.lista}>
                  {pendentes.map((item) => {
                    const classe = item.exata ? estilos.itemExato : item.candidatas.length > 1 ? estilos.itemRevisao : "";
                    return (
                      <li key={item.id} className={`${estilos.item} ${classe}`}>
                        <p className={estilos.linhaTopo}>
                          <span className={`${estilos.valor} ${item.tipo === "entrada" ? estilos.entrada : estilos.saida}`}>
                            {item.tipo === "entrada" ? "+" : "−"}
                            {formatarDinheiro(item.valor)}
                          </span>
                          <span className={estilos.contagem}>{formatarDataBrasileira(item.data)}</span>
                        </p>
                        <p className={estilos.descricao}>{item.descricao}</p>
                        {item.numeroDocumento ? <p className={estilos.apoio}>Documento {item.numeroDocumento}</p> : null}

                        <div className={estilos.sugestao}>
                          {item.candidatas.length === 0 ? (
                            <p className={estilos.apoio}>
                              Nenhum lançamento do sistema corresponde. Crie o lançamento, dê baixa numa conta em aberto, ou
                              ignore.
                            </p>
                          ) : item.exata ? (
                            <>
                              <p className={estilos.apoio}>
                                <SeloSituacao tom="sucesso" rotulo="Correspondência exata" /> mesmo valor e mesma data
                              </p>
                              <p className={estilos.apoio}>{rotuloDaMovimentacao(porId.get(item.candidatas[0]!.movimentacaoId)!)}</p>
                              <span className={estilos.acoes}>
                                <BotaoConciliar
                                  contaBancariaId={contaEscolhida!}
                                  itemExtratoId={item.id}
                                  movimentacaoId={item.candidatas[0]!.movimentacaoId}
                                  rotulo="Conciliar"
                                />
                              </span>
                            </>
                          ) : (
                            <>
                              <p className={estilos.apoio}>
                                <SeloSituacao tom="atencao" rotulo={item.candidatas.length > 1 ? "Precisa escolher" : "Data diferente"} />{" "}
                                {item.candidatas.length > 1
                                  ? `${item.candidatas.length} lançamentos combinam. Escolha qual é.`
                                  : "O valor bate, mas a data é outra. Confira antes de conciliar."}
                              </p>
                              <ul className={estilos.candidatas}>
                                {item.candidatas.map((candidata) => {
                                  const movimentacao = porId.get(candidata.movimentacaoId);
                                  if (!movimentacao) return null;
                                  return (
                                    <li key={candidata.movimentacaoId} className={estilos.candidata}>
                                      <span>
                                        {rotuloDaMovimentacao(movimentacao)}
                                        {candidata.diferencaDeDias !== 0
                                          ? ` · ${Math.abs(candidata.diferencaDeDias)} ${Math.abs(candidata.diferencaDeDias) === 1 ? "dia" : "dias"} de diferença`
                                          : ""}
                                      </span>
                                      <BotaoConciliar
                                        contaBancariaId={contaEscolhida!}
                                        itemExtratoId={item.id}
                                        movimentacaoId={candidata.movimentacaoId}
                                        rotulo="Conciliar com este"
                                      />
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}

                          {painel.movimentacoes.length > 1 ? (
                            <FormularioVarios
                              contaBancariaId={contaEscolhida!}
                              itemExtratoId={item.id}
                              valorDoItem={formatarDinheiro(item.valor)}
                              movimentacoes={painel.movimentacoes
                                .filter((m) => m.tipo === item.tipo)
                                .map((m) => ({ id: m.id, rotulo: rotuloDaMovimentacao(m) }))}
                            />
                          ) : null}

                          <FormularioLancamento
                            contaBancariaId={contaEscolhida!}
                            itemExtratoId={item.id}
                            categorias={categoriasDeLancamento}
                          />

                          {item.tipo === "saida" && parcelasAPagar.length > 0 ? (
                            <FormularioBaixa
                              contaBancariaId={contaEscolhida!}
                              itemExtratoId={item.id}
                              area="pagar"
                              parcelas={parcelasAPagar}
                            />
                          ) : null}
                          {item.tipo === "entrada" && parcelasAReceber.length > 0 ? (
                            <FormularioBaixa
                              contaBancariaId={contaEscolhida!}
                              itemExtratoId={item.id}
                              area="receber"
                              parcelas={parcelasAReceber}
                            />
                          ) : null}

                          <FormularioIgnorar contaBancariaId={contaEscolhida!} itemExtratoId={item.id} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={estilos.coluna} aria-labelledby="titulo-sistema">
              <p className={estilos.tituloColuna}>
                <strong id="titulo-sistema">O que o sistema registrou</strong>
                <span className={estilos.contagem}>{painel.movimentacoes.length} não conferidos</span>
              </p>

              {painel.movimentacoes.length === 0 ? (
                <EstadoVazio
                  titulo="Nenhum lançamento pendente"
                  explicacao="Todas as movimentações desta conta já foram conferidas com o extrato."
                />
              ) : (
                <ul className={estilos.lista}>
                  {painel.movimentacoes.map((movimentacao) => (
                    <li key={movimentacao.id} className={estilos.item}>
                      <p className={estilos.linhaTopo}>
                        <span className={`${estilos.valor} ${movimentacao.tipo === "entrada" ? estilos.entrada : estilos.saida}`}>
                          {movimentacao.tipo === "entrada" ? "+" : "−"}
                          {formatarDinheiro(movimentacao.valor)}
                        </span>
                        <span className={estilos.contagem}>{formatarDataBrasileira(movimentacao.data)}</span>
                      </p>
                      <p className={estilos.descricao}>{movimentacao.descricao}</p>
                      <p className={estilos.apoio}>
                        <SeloSituacao tom="neutro" rotulo={NOMES_ORIGEM[movimentacao.origem] ?? movimentacao.origem} />{" "}
                        {movimentacao.categoriaNome ?? "sem categoria"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {resolvidos.length > 0 ? (
            <>
              <TituloSecao
                titulo="Já resolvidos"
                explicacao="Conciliados e ignorados continuam aqui: desfazer é sempre possível, e o histórico não some."
              />
              <ul className={estilos.lista}>
                {resolvidos.map((item) => (
                  <li key={item.id} className={`${estilos.item} ${item.ignorado ? estilos.itemIgnorado : estilos.itemConciliado}`}>
                    <p className={estilos.linhaTopo}>
                      <span className={estilos.valor}>
                        {item.tipo === "entrada" ? "+" : "−"}
                        {formatarDinheiro(item.valor)}
                      </span>
                      <span>
                        <SeloSituacao tom={item.ignorado ? "neutro" : "sucesso"} rotulo={item.ignorado ? "Ignorado" : "Conciliado"} />{" "}
                        <span className={estilos.contagem}>{formatarDataBrasileira(item.data)}</span>
                      </span>
                    </p>
                    <p className={estilos.descricao}>{item.descricao}</p>
                    {item.motivoIgnorar ? <p className={estilos.apoio}>Motivo: {item.motivoIgnorar}</p> : null}
                    {item.conciliacaoId ? (
                      <FormularioDesconciliar contaBancariaId={contaEscolhida!} conciliacaoId={item.conciliacaoId} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
