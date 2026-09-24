import type { Metadata } from "next";

import { CabecalhoPagina, EstadoVazio, TituloSecao } from "@/interface/componentes/indice";

import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { TabelaSimples } from "../_apoio/tabela-simples";
import { FormularioCategoria, FormularioPessoa } from "./formularios";

export const metadata: Metadata = { title: "Cadastros" };

/**
 * Cadastros — o minimo que o fluxo financeiro exige.
 *
 * PESSOAS e PAPEIS, nao duas listas. A interface fala "clientes" e
 * "fornecedores" porque e assim que o usuario pensa, mas por tras existe uma
 * pessoa so, com marcacoes — do jeito que o Gate 3 modelou.
 */
export default async function PaginaCadastros({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { escopo, permissoes } = await exigirContextoFinanceiro("cadastros.visualizar", "/cadastros");
  const parametros = await searchParams;
  const busca = typeof parametros.busca === "string" ? parametros.busca : undefined;
  /*
   * Quem chega de "Nova conta a pagar" (ou a receber) sem fornecedor (ou
   * cliente) vem com `?papel=`: o formulario abre com esse papel ja marcado.
   * Sem papel nenhum o cadastro e recusado, e era o passo que se esquecia.
   */
  const papelSugerido = parametros.papel === "fornecedor" || parametros.papel === "cliente" ? parametros.papel : undefined;

  const cadastros = repositorios.cadastros();
  const [pessoas, categorias, contasPlano] = await Promise.all([
    cadastros.listarPessoas(escopo, busca),
    cadastros.listarCategorias(escopo),
    cadastros.listarContasPlano(escopo),
  ]);
  const podeEditar = permissoes.has("cadastros.editar");

  return (
    <>
      <CabecalhoPagina titulo="Cadastros" descricao="Clientes, fornecedores e categorias financeiras" />

      <TituloSecao
        titulo="Pessoas"
        explicacao="A mesma pessoa pode ser cliente e fornecedor ao mesmo tempo — um cadastro só, dois papéis."
      />
      {pessoas.length === 0 ? (
        <EstadoVazio
          titulo="Ainda não há pessoas cadastradas"
          explicacao="Cadastre um fornecedor para lançar contas a pagar, ou um cliente para lançar contas a receber."
        />
      ) : (
        <TabelaSimples
          legenda="Pessoas cadastradas"
          colunas={[
            { chave: "nome", titulo: "Nome" },
            { chave: "tipo", titulo: "Tipo" },
            { chave: "documento", titulo: "CPF/CNPJ" },
            { chave: "papeis", titulo: "Papéis" },
            { chave: "contato", titulo: "Contato" },
          ]}
          linhas={pessoas.map((p) => ({
            chave: p.pessoaId,
            celulas: {
              nome: p.nome,
              tipo: p.tipo === "juridica" ? "Jurídica" : "Física",
              documento: p.cpfCnpj ?? "—",
              papeis: {
                tipo: "selos" as const,
                selos: [
                  ...(p.ehCliente ? [{ rotulo: "Cliente", tom: "informacao" as const }] : []),
                  ...(p.ehFornecedor ? [{ rotulo: "Fornecedor", tom: "neutro" as const }] : []),
                ],
              },
              contato: p.email ?? p.telefone ?? "—",
            },
          }))}
        />
      )}

      {podeEditar ? (
        <>
          <TituloSecao id="cadastrar-pessoa" titulo="Cadastrar pessoa" />
          <FormularioPessoa {...(papelSugerido ? { papelSugerido } : {})} />
        </>
      ) : null}

      <TituloSecao
        titulo="Categorias financeiras"
        explicacao="Respondem “com o que estamos gastando?” e “de onde vem a receita?”."
      />
      {categorias.length === 0 ? (
        <EstadoVazio
          titulo="Ainda não há categorias"
          explicacao="Toda conta a pagar ou a receber precisa de uma categoria para aparecer certo nos relatórios."
        />
      ) : (
        <TabelaSimples
          legenda="Categorias financeiras"
          colunas={[
            { chave: "nome", titulo: "Categoria" },
            { chave: "plano", titulo: "Conta do plano" },
          ]}
          linhas={categorias.map((c) => ({
            chave: c.id,
            celulas: { nome: c.nome, plano: c.contaPlanoNome },
          }))}
        />
      )}

      {podeEditar ? (
        <>
          <TituloSecao id="nova-categoria" titulo="Nova categoria" />
          <FormularioCategoria contasPlano={contasPlano} />
        </>
      ) : null}
    </>
  );
}
