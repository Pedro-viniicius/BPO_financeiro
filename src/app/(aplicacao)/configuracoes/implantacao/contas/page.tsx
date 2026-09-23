import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina } from "@/interface/componentes/indice";
import { MAXIMO_LINHAS } from "@/modulos/implantacao/publico";

import { exigirContextoFinanceiro, repositorios } from "../../../_apoio/contexto-financeiro";
import { ImportarPlanilha } from "../formularios";
import estilos from "../implantacao.module.css";

export const metadata: Metadata = { title: "Importar contas em aberto" };

export default async function PaginaImportarContas() {
  const { escopo } = await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao/contas");
  const corte = await repositorios.implantacao().dataDeCorte(escopo);

  return (
    <>
      <CabecalhoPagina
        titulo="Contas a pagar e a receber em aberto"
        descricao="O que ainda estava em aberto na data de corte"
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes/implantacao">Voltar para a implantação</Link>}
      />

      {corte === null ? (
        <Aviso
          tom="atencao"
          titulo="Defina a data de corte antes"
          acao={<Link className="acao-primaria" href="/configuracoes/empresa">Definir a data de corte</Link>}
        >
          É ela que diz o que conta como “em aberto”. Sem ela, não há como separar o que veio de antes do que nasce
          aqui.
        </Aviso>
      ) : (
        <>
          <Aviso tom="informacao" titulo="Baixe o modelo antes de começar">
            Uma linha por parcela em aberto. O modelo traz um exemplo preenchido e uma aba explicando cada coluna.
            <p className={estilos.downloads}>
              <a className="acao-secundaria" href="/configuracoes/implantacao/modelo/contas.xlsx">Modelo em Excel (XLSX)</a>{" "}
              <a className="acao-secundaria" href="/configuracoes/implantacao/modelo/contas.csv">Modelo em CSV</a>
            </p>
          </Aviso>

          <ul className={estilos.regras}>
            <li>
              Data de corte: <strong>{corte.split("-").reverse().join("/")}</strong>. Conta que vence depois disso é
              lançada pela tela, não pela carga inicial.
            </li>
            <li><strong>Uma linha por parcela</strong> em aberto. A coluna “Parcela” aceita 3/10.</li>
            <li>
              Importe <strong>clientes e fornecedores antes</strong>: cada conta precisa de alguém já cadastrado, e de
              uma categoria ativa do plano de contas.
            </li>
            <li>
              Se você informar “valor já pago”, entra só o <strong>saldo</strong>; o valor original fica nas
              observações. Registrar o valor cheio exigiria inventar um pagamento no banco.
            </li>
            <li>Se qualquer linha tiver erro, <strong>nada é importado</strong>. Até {MAXIMO_LINHAS} linhas por arquivo.</li>
          </ul>

          <ImportarPlanilha tipo="contas" />
        </>
      )}
    </>
  );
}
