import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, TituloSecao } from "@/interface/componentes/indice";
import { CONJUNTOS } from "@/modulos/exportacao/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";
import estilos from "./exportacao.module.css";

export const metadata: Metadata = { title: "Exportar dados" };

/**
 * Levar os dados embora.
 *
 * A proposta comercial garante que os dados "podem ser exportados a qualquer
 * momento, inclusive ao fim do piloto". Uma tela que so promete isso nao
 * basta: ela precisa dizer o que vem no pacote, o que NAO vem, e como os
 * arquivos se ligam — senao o cliente recebe um ZIP que ninguem sabe usar.
 */
export default async function PaginaExportacao() {
  const { nomeEmpresa } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes/exportacao");

  return (
    <>
      <CabecalhoPagina
        titulo="Exportar dados"
        descricao={`Todos os dados de ${nomeEmpresa}, em planilhas`}
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes">Voltar para Configurações</Link>}
      />

      <Aviso tom="informacao" titulo="Os dados são seus, a qualquer momento">
        O pacote sai em CSV, que abre no Excel e em qualquer outro sistema — não em um formato que só este programa
        entenda. Vem com um <strong>LEIAME</strong> explicando cada arquivo e como eles se ligam.
        <p className={estilos.acao}>
          {/*
            Link direto, e nao ação de formulário: o navegador baixa o arquivo
            sem sair da página, e a tela não precisa segurar o ZIP em memória.
          */}
          <a className="acao-primaria" href="/configuracoes/exportacao/arquivo">Exportar todos os dados</a>
        </p>
      </Aviso>

      <TituloSecao titulo="O que vem no pacote" explicacao={`${CONJUNTOS.length} arquivos, um por assunto.`} />
      <dl className={estilos.conjuntos}>
        {CONJUNTOS.map((conjunto) => (
          <div key={conjunto.arquivo}>
            <dt>{conjunto.arquivo}.csv</dt>
            <dd>
              {conjunto.descricao}
              {conjunto.ligacoes ? <span className={estilos.ligacoes}>{conjunto.ligacoes}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <TituloSecao titulo="O que não vem, e por quê" />
      <ul className={estilos.fora}>
        <li>
          <strong>Senhas e tokens de acesso.</strong> São credenciais, não dados: exportá-las entregaria o acesso
          junto com a informação.
        </li>
        <li>
          <strong>Tabelas de controle do sistema</strong> (migrações, fila de tarefas, sequências de código). Dizem
          respeito ao programa, não à empresa.
        </li>
        <li>
          <strong>Dados de outras empresas.</strong> Toda consulta filtra por esta empresa, e há teste provando.
        </li>
        <li>
          <strong>Os anexos enviados.</strong> Ficam fora deste pacote; peça-os separadamente.
        </li>
      </ul>
    </>
  );
}
