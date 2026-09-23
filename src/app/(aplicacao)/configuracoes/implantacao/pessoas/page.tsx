import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import { MAXIMO_LINHAS } from "@/modulos/implantacao/publico";

import { exigirContextoFinanceiro } from "../../../_apoio/contexto-financeiro";
import { ImportarPlanilha } from "../formularios";
import estilos from "../implantacao.module.css";

export const metadata: Metadata = { title: "Importar clientes e fornecedores" };

export default async function PaginaImportarPessoas() {
  await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/pessoas");

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes e fornecedores"
        descricao="Por planilha, de uma vez — ou um a um, em Cadastros"
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes/implantacao">Voltar para a implantação</Link>}
      />

      <Aviso tom="informacao" titulo="Baixe o modelo antes de começar">
        Ele já vem com os cabeçalhos certos, uma linha de exemplo e uma aba explicando o que vai em cada coluna.
        <p className={estilos.downloads}>
          <a className="acao-secundaria" href="/configuracoes/implantacao/modelo/pessoas.xlsx">Modelo em Excel (XLSX)</a>{" "}
          <a className="acao-secundaria" href="/configuracoes/implantacao/modelo/pessoas.csv">Modelo em CSV</a>{" "}
          <Link className="acao-secundaria" href="/cadastros">Cadastrar um a um</Link>
        </p>
      </Aviso>

      <ul className={estilos.regras}>
        <li>O <strong>CPF/CNPJ</strong> é o que faz o sistema reconhecer quem já está cadastrado, em vez de duplicar.</li>
        <li>Quem já existe <strong>ganha o papel que faltava</strong> — não vira um segundo cadastro.</li>
        <li>Se qualquer linha tiver erro, <strong>nada é importado</strong>. Você corrige e envia de novo.</li>
        <li>Até {MAXIMO_LINHAS} linhas por arquivo.</li>
      </ul>

      <ImportarPlanilha tipo="pessoas" />
    </>
  );
}
