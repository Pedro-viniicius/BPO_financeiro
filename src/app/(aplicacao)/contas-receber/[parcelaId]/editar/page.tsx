import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { camposEditaveis, motivoDoBloqueio, podeEditarAlgo } from "@/compartilhado/financeiro/indice";
import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";

import { categoriasQueClassificamContas } from "../../../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../../../_apoio/contexto-financeiro";
import { FormularioEdicaoContaReceber } from "./formulario";

export const metadata: Metadata = { title: "Editar conta a receber" };

/**
 * Edicao de uma conta a receber.
 *
 * Quais campos abrem depende do estado da conta, e a regra vem de
 * `compartilhado/financeiro/regras-edicao` — a MESMA que o repositorio aplica
 * de novo antes de gravar. A tela nao e o controle; ela so evita que a pessoa
 * digite algo que sera recusado.
 *
 * Campo bloqueado aparece como somente leitura COM O MOTIVO ao lado, em texto.
 * Nao em tooltip: dica que so aparece no passar do mouse nao existe no celular
 * e nao e lida por leitor de tela.
 */
export default async function PaginaEditarContaReceber({ params }: { params: Promise<{ parcelaId: string }> }) {
  const { parcelaId } = await params;
  const { escopo, hoje } = await exigirContextoFinanceiro("contas_receber.editar", `/contas-receber/${parcelaId}/editar`);

  const conta = await repositorios.contasReceber().buscarPorId(escopo, parcelaId, hoje);
  if (!conta) notFound();

  const estadoTitulo = { cancelado: conta.tituloCancelado, temBaixaAtiva: conta.tituloTemBaixaAtiva };
  const estadoParcela = { cancelada: conta.situacao === "cancelada", temBaixaAtiva: conta.parcelaTemBaixaAtiva };
  const editaveis = camposEditaveis(estadoTitulo, estadoParcela);

  if (!podeEditarAlgo(estadoTitulo, estadoParcela)) {
    return (
      <>
        <CabecalhoPagina titulo="Editar conta a receber" descricao={conta.codigo} />
        <Aviso
          tom="atencao"
          titulo="Esta conta não pode mais ser editada"
          acao={<Link className="acao-primaria" href={`/contas-receber/${parcelaId}`}>Voltar para a conta</Link>}
        >
          {motivoDoBloqueio("descricao", estadoTitulo, estadoParcela)}
        </Aviso>
      </>
    );
  }

  const cadastros = repositorios.cadastros();
  const [clientees, categorias] = await Promise.all([
    cadastros.listarClientes(escopo),
    cadastros.listarCategorias(escopo),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Editar conta a receber"
        descricao={`${conta.codigo} · ${conta.descricao}`}
        acoesSecundarias={<Link className="acao-secundaria" href={`/contas-receber/${parcelaId}`}>Voltar para a conta</Link>}
      />

      <FormularioEdicaoContaReceber
        conta={{
          parcelaId: conta.parcelaId,
          descricao: conta.descricao,
          clienteId: conta.clienteId,
          clienteNome: conta.clienteNome,
          categoriaId: conta.categoriaId,
          categoriaNome: conta.categoriaNome,
          dataVencimento: conta.dataVencimento,
          valorCanonico: conta.valorOriginal.paraTexto(),
          valorFormatado: conta.valorOriginal.formatarBrasileiro(),
          observacoes: conta.observacoes,
          numeroParcela: conta.numeroParcela,
          quantidadeParcelas: conta.quantidadeParcelas,
        }}
        editaveis={editaveis}
        motivos={{
          pessoa: motivoDoBloqueio("pessoa", estadoTitulo, estadoParcela),
          vencimento: motivoDoBloqueio("vencimento", estadoTitulo, estadoParcela),
          valor: motivoDoBloqueio("valor", estadoTitulo, estadoParcela),
        }}
        clientees={clientees}
        categorias={categoriasQueClassificamContas(categorias)}
      />
    </>
  );
}
