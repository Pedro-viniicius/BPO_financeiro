import type { Metadata } from "next";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import Link from "next/link";

import { categoriasQueClassificamContas } from "../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";
import { FormularioNovaContaReceber } from "./formulario";

export const metadata: Metadata = { title: "Nova conta a receber" };

/** Criar exige `contas_receber.criar`: a guarda roda antes de qualquer leitura. */
export default async function PaginaNovaContaReceber() {
  const { escopo, hoje } = await exigirContextoFinanceiro("contas_receber.criar", "/contas-receber/nova");
  const cadastros = repositorios.cadastros();
  const [clientes, categorias] = await Promise.all([
    cadastros.listarClientes(escopo),
    cadastros.listarCategorias(escopo),
  ]);

  // Sem cliente ou sem categoria a conta nao pode existir: o modelo exige
  // os dois. Em vez de deixar a pessoa preencher e falhar no fim, o caminho e
  // mostrado antes.
  const faltando = [
    clientes.length === 0 ? { o: "um cliente", onde: "/cadastros" } : null,
    categorias.length === 0 ? { o: "uma categoria financeira", onde: "/cadastros" } : null,
  ].filter((x): x is { o: string; onde: string } => x !== null);

  return (
    <>
      <CabecalhoPagina titulo="Nova conta a receber" descricao="Uma venda ou serviço a receber de um cliente, com data e valor" />

      {faltando.length > 0 ? (
        <Aviso
          tom="informacao"
          titulo={`Antes, cadastre ${faltando.map((f) => f.o).join(" e ")}`}
          acao={
            // Direto ao formulario que falta: sem cliente, o de pessoa ja com o papel marcado; senao, o de categoria.
            <Link className="acao-primaria" href={clientes.length === 0 ? "/cadastros?papel=cliente#cadastrar-pessoa" : "/cadastros#nova-categoria"}>
              {clientes.length === 0 ? "Cadastrar cliente" : "Criar categoria"}
            </Link>
          }
        >
          Toda conta a receber precisa de um cliente e de uma categoria — é a categoria que responde depois “de onde vem a receita?”.
        </Aviso>
      ) : (
        <FormularioNovaContaReceber clientes={clientes} categorias={categoriasQueClassificamContas(categorias)} hoje={hoje} />
      )}
    </>
  );
}
