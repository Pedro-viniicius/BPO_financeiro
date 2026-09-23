import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, TituloSecao } from "@/interface/componentes/indice";
import { NOMES_PAPEIS, PAPEIS, PERMISSOES_POR_PAPEL, type Papel } from "@/nucleo/autorizacao/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";
import estilos from "./papeis.module.css";

export const metadata: Metadata = { title: "Papéis e permissões" };

/**
 * O que cada papel pode fazer, em portugues.
 *
 * A lista e derivada do CATALOGO de permissoes, nao escrita a mao: uma tabela
 * copiada envelhece na primeira permissao nova, e passaria a mentir para quem
 * escolhe o papel de alguem.
 */
const ASSUNTOS: readonly { readonly prefixo: string; readonly rotulo: string }[] = [
  { prefixo: "contas_pagar", rotulo: "Contas a pagar" },
  { prefixo: "contas_receber", rotulo: "Contas a receber" },
  { prefixo: "cobranca", rotulo: "Cobrança" },
  { prefixo: "faturamento", rotulo: "Faturamento" },
  { prefixo: "cadastros", rotulo: "Cadastros" },
  { prefixo: "bancos", rotulo: "Bancos e conciliação" },
  { prefixo: "caixa", rotulo: "Caixa" },
  { prefixo: "fluxo_caixa", rotulo: "Fluxo de caixa" },
  { prefixo: "previsao", rotulo: "Previsão" },
  { prefixo: "dividas", rotulo: "Dívidas" },
  { prefixo: "plano_contas", rotulo: "Plano de contas" },
  { prefixo: "centros_custo", rotulo: "Centros de custo" },
  { prefixo: "dre", rotulo: "Resultados" },
  { prefixo: "orcamento", rotulo: "Orçamento" },
  { prefixo: "relatorios", rotulo: "Relatórios" },
  { prefixo: "indicadores", rotulo: "Indicadores" },
  { prefixo: "importacao", rotulo: "Importação" },
  { prefixo: "exportacao", rotulo: "Exportação" },
  { prefixo: "auditoria", rotulo: "Auditoria" },
  { prefixo: "usuarios", rotulo: "Usuários" },
  { prefixo: "configuracao", rotulo: "Configurações" },
  { prefixo: "analises_ia", rotulo: "Análises com IA" },
];

const VERBOS: Record<string, string> = {
  visualizar: "ver",
  criar: "criar",
  editar: "editar",
  aprovar: "aprovar",
  pagar: "pagar",
  baixar: "baixar",
  cancelar: "cancelar",
  excluir: "excluir",
  emitir: "emitir",
  conciliar: "conciliar",
  importar_extrato: "importar extrato",
  movimentar: "movimentar",
  editar_premissas: "editar premissas",
  exportar: "exportar",
  executar: "executar",
  gerenciar: "gerenciar",
  registrar_contato: "registrar contato",
  renegociar: "renegociar",
  perguntar: "perguntar",
};

function oQuePodeFazer(papel: Papel): { rotulo: string; acoes: string }[] {
  const permissoes = PERMISSOES_POR_PAPEL[papel];
  return ASSUNTOS.map((assunto) => {
    const acoes = [...permissoes]
      .filter((permissao) => permissao.startsWith(`${assunto.prefixo}.`))
      .map((permissao) => VERBOS[permissao.split(".")[1] ?? ""] ?? permissao.split(".")[1])
      .filter((acao): acao is string => Boolean(acao));
    return { rotulo: assunto.rotulo, acoes: acoes.join(", ") };
  }).filter((linha) => linha.acoes.length > 0);
}

export default async function PaginaPapeis() {
  await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/papeis");

  return (
    <>
      <CabecalhoPagina
        titulo="Papéis e permissões"
        descricao="O que cada papel pode fazer no sistema"
        acoesSecundarias={<Link className="acao-secundaria" href="/configuracoes/usuarios">Voltar para Usuários</Link>}
      />

      <Aviso tom="informacao" titulo="Os papéis são fixos nesta versão">
        Não é possível criar um papel novo nem ajustar as permissões de um existente pela tela. Escolha o papel que
        mais se aproxima do que a pessoa precisa fazer — e, na dúvida, o mais restrito: ampliar depois é uma mudança
        de papel, enquanto conceder demais só aparece quando algo já aconteceu.
      </Aviso>

      {PAPEIS.map((papel) => (
        <section key={papel} className={estilos.papel}>
          <TituloSecao titulo={NOMES_PAPEIS[papel]} nivel={2} />
          <dl className={estilos.lista}>
            {oQuePodeFazer(papel).map((linha) => (
              <div key={linha.rotulo}>
                <dt>{linha.rotulo}</dt>
                <dd>{linha.acoes}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
