import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { RepositorioDadosDaEmpresaDrizzle } from "@/nucleo/empresas/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";
import { FormularioEmpresa } from "./formulario";

export const metadata: Metadata = { title: "Dados da empresa" };

/**
 * Dados da empresa — inclusive a DATA DE CORTE.
 *
 * Exige `configuracao.gerenciar`: mudar CNPJ ou data de corte altera como o
 * sistema inteiro le os dados, e nao e tarefa de quem so lanca contas.
 */
export default async function PaginaEmpresa() {
  const { escopo, hoje } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes/empresa");
  const dados = await new RepositorioDadosDaEmpresaDrizzle(obterBancoDados()).obter(escopo);

  if (!dados) {
    return (
      <>
        <CabecalhoPagina titulo="Dados da empresa" />
        <Aviso tom="perigo" titulo="Empresa não encontrada" urgente>
          A empresa ativa não foi localizada. Saia e entre de novo; se persistir, fale com o suporte.
        </Aviso>
      </>
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Dados da empresa"
        descricao="Identificação, contato e a data em que a empresa passou a usar o sistema"
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes">Voltar para Configurações</Link>}
      />

      {dados.dataInicioUso === null ? (
        <Aviso tom="atencao" titulo="Falta a data de corte">
          É a data em que a empresa passou a usar o sistema. Ela separa o que veio de antes do que nasceu aqui — a
          carga inicial usa essa data para os saldos bancários e para saber quais contas em aberto importar. Sem ela,
          um saldo informado não tem a que dia se referir.
        </Aviso>
      ) : null}

      <FormularioEmpresa dados={dados} hoje={hoje} />
    </>
  );
}
