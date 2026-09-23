import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, SeloSituacao, TituloSecao } from "@/interface/componentes/indice";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioCategoria, FormularioConta, PlanoPadrao } from "./formularios";
import estilos from "./plano.module.css";

export const metadata: Metadata = { title: "Plano de contas" };

/**
 * Plano de contas — a ponte entre o lancamento e o demonstrativo.
 *
 * Ate o Gate 8 esta tela nao existia: montar o plano exigia SQL. E sem plano
 * nao ha categoria, sem categoria nao ha conta a pagar nem a receber — uma
 * instalacao nova travava no primeiro lancamento.
 *
 * A arvore e agrupada por LINHA DO DEMONSTRATIVO, nao por codigo, porque a
 * pergunta de quem mexe aqui e "onde isso vai aparecer no Resultados?".
 */
export default async function PaginaPlanoDeContas() {
  const { escopo, permissoes } = await exigirContextoFinanceiro("plano_contas.visualizar", "/cadastros/plano-de-contas");
  const plano = await repositorios.planoContas().montar(escopo);
  const podeEditar = permissoes.has("plano_contas.editar");

  const contasParaSelecao = plano.grupos.flatMap((grupo) =>
    grupo.contas.map((conta) => ({ id: conta.id, nome: `${conta.codigo} · ${conta.nome}` })),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Plano de contas"
        descricao="Como cada lançamento chega ao demonstrativo de resultados"
        acoesSecundarias={<Link className="acao-secundaria" href="/cadastros">Voltar para Cadastros</Link>}
      />

      {plano.totalContas === 0 ? (
        <EstadoVazio
          titulo="Nenhuma conta no plano"
          explicacao="Sem plano de contas não existe categoria, e sem categoria não é possível lançar uma conta a pagar ou a receber. Comece pelo plano padrão e ajuste depois."
          acao={podeEditar ? <PlanoPadrao /> : undefined}
        />
      ) : (
        <>
          <div className={estilos.indicadores}>
            <CartaoResumo
              titulo="Contas"
              valor={<strong className={estilos.contador}>{plano.totalContas}</strong>}
              explicacao="Agrupam as categorias e definem em que linha do resultado elas entram."
              tom="neutro"
            />
            <CartaoResumo
              titulo="Categorias"
              valor={<strong className={estilos.contador}>{plano.totalCategorias}</strong>}
              explicacao="É a categoria que você escolhe ao lançar uma conta."
              tom="neutro"
            />
            <CartaoResumo
              titulo="Linhas do resultado sem categoria"
              valor={<strong className={estilos.contador}>{plano.linhasSemCategoria.length}</strong>}
              explicacao="Linhas que nunca vão receber valor, porque não há como classificar nada nelas."
              tom={plano.linhasSemCategoria.length === 0 ? "sucesso" : "atencao"}
            />
          </div>

          {/*
            O aviso vem ANTES da arvore: uma linha do demonstrativo sem
            categoria nenhuma aparece zerada no Resultados como se realmente
            nao houvesse nada — e ninguem procura o que nao sabe que falta.
          */}
          {plano.linhasSemCategoria.length > 0 ? (
            <Aviso
              tom="atencao"
              titulo={`${plano.linhasSemCategoria.length} ${plano.linhasSemCategoria.length === 1 ? "linha do resultado não tem" : "linhas do resultado não têm"} nenhuma categoria`}
            >
              Nada pode ser classificado em {plano.linhasSemCategoria.map((l) => l.rotulo).join(", ")}. Essas linhas vão
              aparecer zeradas no Resultados mesmo que a empresa tenha movimento ali. Crie ao menos uma categoria para
              cada uma — ou use o plano padrão, que já cobre todas.
            </Aviso>
          ) : null}

          {plano.categoriasForaDoResultado.length > 0 ? (
            <Aviso tom="informacao" titulo="Categorias que ficam fora do resultado, de propósito">
              {plano.categoriasForaDoResultado.map((c) => c.nome).join(", ")} — são movimentações que não viram receita
              nem despesa, como transferência entre contas e amortização de dívida. Se você classificar uma despesa
              aqui por engano, ela não vai aparecer em lugar nenhum do Resultados.
            </Aviso>
          ) : null}

          {podeEditar ? (
            <div className={estilos.acoes}>
              <FormularioConta contas={contasParaSelecao} />
              <FormularioCategoria contas={contasParaSelecao} />
              <PlanoPadrao />
            </div>
          ) : null}

          {plano.grupos.map((grupo) => (
            <section key={grupo.grupo} className={estilos.grupo}>
              <TituloSecao titulo={grupo.rotulo} explicacao={grupo.explicacao} />
              <ul className={estilos.contas}>
                {grupo.contas.map((conta) => (
                  <li key={conta.id} className={conta.ativa ? estilos.conta : `${estilos.conta} ${estilos.inativa}`}>
                    <div className={estilos.contaTopo}>
                      <div>
                        <span className={estilos.codigo}>{conta.codigo}</span>{" "}
                        <strong>{conta.nome}</strong>{" "}
                        {conta.ativa ? null : <SeloSituacao rotulo="Inativa" tom="neutro" />}
                      </div>
                      {podeEditar ? (
                        <FormularioConta
                          contas={contasParaSelecao}
                          conta={{ id: conta.id, codigo: conta.codigo, nome: conta.nome, grupoDre: conta.grupoDre, ativa: conta.ativa, podeExcluir: conta.podeExcluir }}
                        />
                      ) : null}
                    </div>

                    {conta.categorias.length === 0 ? (
                      <p className={estilos.semCategoria}>
                        Sem categorias. Uma conta sem categoria não classifica nada.
                      </p>
                    ) : (
                      <ul className={estilos.categorias}>
                        {conta.categorias.map((categoria) => (
                          <li key={categoria.id} className={categoria.ativa ? undefined : estilos.inativa}>
                            <span className={estilos.nomeCategoria}>
                              {categoria.nome}
                              {categoria.ativa ? null : <> <SeloSituacao rotulo="Inativa" tom="neutro" /></>}
                            </span>
                            <span className={estilos.usos}>
                              {categoria.usos === 0
                                ? "nunca usada"
                                : `${categoria.usos} ${categoria.usos === 1 ? "lançamento" : "lançamentos"}`}
                            </span>
                            {podeEditar ? (
                              <FormularioCategoria
                                contas={contasParaSelecao}
                                categoria={{
                                  id: categoria.id,
                                  nome: categoria.nome,
                                  contaPlanoId: conta.id,
                                  ativa: categoria.ativa,
                                  podeExcluir: categoria.podeExcluir,
                                  usos: categoria.usos,
                                }}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
