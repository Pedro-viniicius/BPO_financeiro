import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioNovaDivida } from "./formulario";

export const metadata: Metadata = { title: "Registrar dívida" };

/**
 * Registrar divida exige `dividas.editar`: a guarda roda antes de qualquer
 * leitura. Nao existe `dividas.criar` no catalogo, e nenhuma permissao e
 * inventada aqui.
 */
export default async function PaginaNovaDivida() {
  const { escopo, hoje } = await exigirContextoFinanceiro("dividas.editar", "/dividas/nova");
  const cadastros = repositorios.cadastros();
  const [pessoas, categorias, contas] = await Promise.all([
    cadastros.listarPessoas(escopo),
    cadastros.listarCategorias(escopo),
    repositorios.bancos().listar(escopo),
  ]);

  /*
   * PESSOAS, nao fornecedores. A divida e com uma PESSOA; ser fornecedor e um
   * papel que ela tem (ou passa a ter quando a divida gera as contas a pagar).
   * `listarFornecedores` devolve o id do PAPEL — usa-lo aqui faria o cadastro
   * falhar com "credor nao encontrado", porque o modelo espera `pessoas.id`.
   */
  const credores = pessoas.map((pessoa) => ({ id: pessoa.pessoaId, nome: pessoa.nome }));

  // Os juros de uma divida sao despesa FINANCEIRA, nao despesa operacional:
  // pagar juros nao e "gastar com a operacao", e o preco do dinheiro. Oferecer
  // qualquer categoria aqui produziria um demonstrativo que mistura as duas
  // coisas — e o resultado operacional deixaria de significar alguma coisa.
  const categoriasDeJuros = categorias.filter((categoria) => categoria.grupoDre === "resultado_financeiro");

  const faltando = [
    credores.length === 0 ? { o: "o credor", onde: "/cadastros" } : null,
    categoriasDeJuros.length === 0 ? { o: "uma categoria de despesa financeira", onde: "/cadastros" } : null,
  ].filter((x): x is { o: string; onde: string } => x !== null);

  return (
    <>
      <CabecalhoPagina
        titulo="Registrar dívida"
        descricao="Empréstimo, financiamento ou parcelamento com juros"
      />

      {faltando.length > 0 ? (
        <Aviso
          tom="informacao"
          titulo={`Antes, cadastre ${faltando.map((f) => f.o).join(" e ")}`}
          acao={<Link className="acao-primaria" href="/cadastros">Ir para Cadastros</Link>}
        >
          O credor é uma pessoa do cadastro — o banco ou a financeira. E os juros precisam de uma categoria do grupo
          “Resultado financeiro”: é ela que separa o custo do dinheiro das despesas da operação.
        </Aviso>
      ) : (
        <FormularioNovaDivida
          credores={credores}
          categorias={categoriasDeJuros}
          contas={contas.filter((conta) => conta.ativa).map((conta) => ({ id: conta.id, nome: conta.instituicaoNome ? `${conta.nome} · ${conta.instituicaoNome}` : conta.nome }))}
          hoje={hoje}
        />
      )}
    </>
  );
}
