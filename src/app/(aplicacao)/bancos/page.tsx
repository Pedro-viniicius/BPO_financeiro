import type { Metadata } from "next";

import { CabecalhoPagina, EstadoVazio, TituloSecao } from "@/interface/componentes/indice";

import { formatarDataBrasileira, formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import { TabelaSimples } from "../_apoio/tabela-simples";
import { FormularioContaBancaria } from "./formulario";
import { NOMES_TIPO_CONTA } from "./tipos-de-conta";

export const metadata: Metadata = { title: "Bancos e caixa" };

/**
 * Bancos e caixa — o minimo do Gate 5.
 *
 * Existe porque pagamento e recebimento EXIGEM conta bancaria: sem ao menos
 * uma cadastrada, nenhuma baixa pode ser registrada. Conciliacao, importacao
 * de extrato e fluxo de caixa sao do Gate 6 e nao aparecem aqui.
 *
 * O saldo NAO e uma coluna: e saldo inicial mais as movimentacoes, calculado
 * na consulta. Saldo materializado sai de sincronia e ninguem percebe.
 *
 * Cada conta abre o proprio extrato, com saldo acumulado e o lancamento de
 * ajuste — a forma certa de corrigir um saldo que ja tem historico.
 */
export default async function PaginaBancos() {
  const { escopo, hoje, permissoes } = await exigirContextoFinanceiro("bancos.visualizar", "/bancos");
  const contas = await repositorios.bancos().listar(escopo);
  const podeEditar = permissoes.has("bancos.editar");

  return (
    <>
      <CabecalhoPagina titulo="Bancos e caixa" descricao="Onde está o seu dinheiro" />

      {contas.length === 0 ? (
        <EstadoVazio
          titulo="Ainda não há contas cadastradas"
          explicacao="Cadastre a conta de onde o dinheiro sai e entra. Sem ela, não é possível registrar pagamentos nem recebimentos."
        />
      ) : (
        <TabelaSimples
          legenda="Contas bancárias"
          colunas={[
            { chave: "nome", titulo: "Conta" },
            { chave: "tipo", titulo: "Tipo" },
            { chave: "banco", titulo: "Banco" },
            { chave: "agencia", titulo: "Agência / conta" },
            { chave: "desde", titulo: "Saldo inicial" },
            { chave: "saldo", titulo: "Saldo atual", alinhamento: "direita" },
          ]}
          linhas={contas.map((c) => ({
            chave: c.id,
            celulas: {
              // O nome leva ao extrato: e la que se confere o saldo e se acha
              // o lancamento errado antes de corrigi-lo.
              nome: { tipo: "link" as const, texto: c.nome, rota: `/bancos/${c.id}` },
              tipo: NOMES_TIPO_CONTA[c.tipo] ?? c.tipo,
              banco: c.instituicaoNome ?? "—",
              agencia: [c.agencia, c.numeroConta].filter(Boolean).join(" / ") || "—",
              desde: `${formatarDinheiro(c.saldoInicial)} em ${formatarDataBrasileira(c.dataSaldoInicial)}`,
              saldo: formatarDinheiro(c.saldoAtual),
            },
          }))}
        />
      )}

      {podeEditar ? (
        <>
          <TituloSecao titulo="Nova conta" explicacao="O saldo inicial é o ponto de partida; daí em diante ele acompanha as movimentações." />
          <FormularioContaBancaria hoje={hoje} />
        </>
      ) : null}
    </>
  );
}
