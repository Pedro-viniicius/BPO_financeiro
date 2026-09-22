import type { Metadata } from "next";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import Link from "next/link";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioNovaContaPagar } from "./formulario";

export const metadata: Metadata = { title: "Nova conta a pagar" };

/** Criar exige `contas_pagar.criar`: a guarda roda antes de qualquer leitura. */
export default async function PaginaNovaContaPagar() {
  const { escopo, hoje } = await exigirContextoFinanceiro("contas_pagar.criar", "/contas-pagar/nova");
  const cadastros = repositorios.cadastros();
  const [fornecedores, categorias] = await Promise.all([
    cadastros.listarFornecedores(escopo),
    cadastros.listarCategorias(escopo),
  ]);

  // Sem fornecedor ou sem categoria a conta nao pode existir: o modelo exige
  // os dois. Em vez de deixar a pessoa preencher e falhar no fim, o caminho e
  // mostrado antes.
  const faltando = [
    fornecedores.length === 0 ? { o: "um fornecedor", onde: "/cadastros" } : null,
    categorias.length === 0 ? { o: "uma categoria financeira", onde: "/cadastros" } : null,
  ].filter((x): x is { o: string; onde: string } => x !== null);

  return (
    <>
      <CabecalhoPagina titulo="Nova conta a pagar" descricao="Um compromisso com fornecedor, com data e valor" />

      {faltando.length > 0 ? (
        <Aviso
          tom="informacao"
          titulo={`Antes, cadastre ${faltando.map((f) => f.o).join(" e ")}`}
          acao={<Link className="acao-primaria" href="/cadastros">Ir para Cadastros</Link>}
        >
          Toda conta a pagar precisa de um fornecedor e de uma categoria — é a categoria que responde depois “com o que estamos gastando?”.
        </Aviso>
      ) : (
        <FormularioNovaContaPagar fornecedores={fornecedores} categorias={categorias} hoje={hoje} />
      )}
    </>
  );
}
