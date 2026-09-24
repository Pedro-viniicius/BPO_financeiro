import type { Metadata } from "next";
import Link from "next/link";

import { inicioDoMes, fimDoMes, partesDaData } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { Aviso, CabecalhoPagina, CartaoResumo, EstadoVazio, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./inicio.module.css";

export const metadata: Metadata = { title: "Início" };

/**
 * O painel soma so o que esta EM ABERTO. Antes ele lia as 500 primeiras
 * parcelas por vencimento, de qualquer situacao, e filtrava depois: com mais
 * de 500 parcelas no historico — poucos meses de uso — as mais antigas, quase
 * todas pagas, ocupavam o espaco e as contas em aberto mais recentes ficavam
 * fora de "Quanto tenho a pagar". Pedindo so as em aberto, o limite so e
 * atingido por quem tem mais de 500 contas abertas, e ai a tela diz isso.
 */
const EM_ABERTO: readonly SituacaoDerivada[] = ["aberta", "parcial", "vencida"];
const LIMITE_DO_PAINEL = 500;

/**
 * Inicio — a sintese do dia.
 *
 * Numeros REAIS, lidos do banco, ou nenhum numero. Enquanto nao houver conta
 * cadastrada, a tela diz isso com todas as letras e oferece o proximo passo.
 * Um painel que inventa valores de exemplo em sistema financeiro e pior do que
 * um painel vazio: alguem decide com base neles.
 *
 * O painel completo (previsao, fluxo, resultado) e dos Gates 6 e 7.
 */
export default async function PaginaInicio() {
  const { escopo, hoje, nomeEmpresa, permissoes } = await exigirContextoFinanceiro("relatorios.visualizar", "/inicio");

  /*
   * O painel le contas a pagar e a receber, entao respeita as MESMAS permissoes
   * das telas. Sem isto, quem nao pode abrir /contas-pagar veria os valores
   * dela resumidos aqui — o painel viraria a porta dos fundos da autorizacao.
   */
  const vePagar = permissoes.has("contas_pagar.visualizar");
  const veReceber = permissoes.has("contas_receber.visualizar");
  const veResultado = permissoes.has("dre.visualizar");
  const veOrcamento = permissoes.has("orcamento.visualizar");

  const paginacao = { pagina: 1, tamanho: LIMITE_DO_PAINEL };
  const vazio = { itens: [], total: 0, pagina: 1, tamanho: paginacao.tamanho };
  const soExiste = { pagina: 1, tamanho: 1 };
  /*
   * O resultado do mes vem do MODULO DE RESULTADOS, a mesma fonte da tela
   * `/resultados`. Recalcular aqui "so o numerinho do painel" e como dois
   * relogios na mesma parede: mais cedo ou mais tarde eles discordam, e nao ha
   * como saber qual esta certo.
   */
  const mes = { de: inicioDoMes(hoje), ate: fimDoMes(hoje), regime: "caixa" as const };
  const { ano: anoCorrente, mes: mesCorrente } = partesDaData(hoje);
  const [pagar, receber, algumaPagar, algumaReceber, resultadoDoMes, orcamentoDoMes] = await Promise.all([
    vePagar ? repositorios.contasPagar().listar(escopo, { situacoes: EM_ABERTO }, paginacao, hoje) : vazio,
    veReceber ? repositorios.contasReceber().listar(escopo, { situacoes: EM_ABERTO }, paginacao, hoje) : vazio,
    // So para saber se a empresa ja tem ALGUMA conta (inclusive paga): decide o estado vazio.
    vePagar ? repositorios.contasPagar().listar(escopo, {}, soExiste, hoje) : vazio,
    veReceber ? repositorios.contasReceber().listar(escopo, {}, soExiste, hoje) : vazio,
    veResultado ? repositorios.resultados().montar(escopo, mes, hoje) : null,
    veOrcamento ? repositorios.orcamento().acompanhar(escopo, anoCorrente, mesCorrente, "caixa", hoje) : null,
  ]);
  const estouros = orcamentoDoMes?.estouros ?? [];

  const vencidas = <T extends { situacao: string }>(itens: readonly T[]) => itens.filter((i) => i.situacao === "vencida");

  const aPagar = pagar.itens;
  const aReceber = receber.itens;
  const pagarVencido = vencidas(pagar.itens);
  const receberVencido = vencidas(receber.itens);
  /** Mais contas em aberto do que o painel soma: a tela diz, em vez de mostrar um total parcial como se fosse o todo. */
  const parcial = (pagina: { total: number; itens: readonly unknown[] }) =>
    pagina.total > pagina.itens.length
      ? ` Soma das ${pagina.itens.length} de vencimento mais próximo; ${pagina.total} ao todo — o total está na lista.`
      : "";

  const totalPagar = Dinheiro.somarTodos(aPagar.map((i) => i.saldo));
  const totalReceber = Dinheiro.somarTodos(aReceber.map((i) => i.saldo));

  if (!vePagar && !veReceber && !veResultado && !veOrcamento) {
    return (
      <>
        <CabecalhoPagina titulo="Início" empresa={nomeEmpresa} descricao="Sua situação de hoje" />
        <EstadoVazio
          titulo="Seu perfil não inclui as áreas financeiras"
          explicacao="Peça a quem administra a empresa para revisar as suas permissões."
        />
      </>
    );
  }

  if (algumaPagar.total === 0 && algumaReceber.total === 0 && !resultadoDoMes?.temDados) {
    return (
      <>
        <CabecalhoPagina titulo="Início" empresa={nomeEmpresa} descricao="Sua situação de hoje e o que precisa de atenção" />
        <EstadoVazio
          titulo="Ainda não há dados financeiros"
          explicacao="Cadastre a primeira conta a pagar ou a receber. A partir daí, esta tela mostra o que vence, o que está em atraso e quanto entra e sai."
          {...(permissoes.has("contas_pagar.criar")
            ? { acao: <Link className="acao-primaria" href="/contas-pagar/nova">Nova conta a pagar</Link> }
            : {})}
          {...(permissoes.has("contas_receber.criar")
            ? { ajuda: <Link href="/contas-receber/nova">Ou cadastre uma conta a receber</Link> }
            : {})}
        />
      </>
    );
  }

  return (
    <>
      <CabecalhoPagina titulo="Início" empresa={nomeEmpresa} descricao="Sua situação de hoje e o que precisa de atenção" />

      {/*
        Estouro de orcamento vem ANTES dos numeros: e a unica coisa desta tela
        que pede decisao hoje. Os cartoes abaixo informam; este avisa.
      */}
      {estouros.length > 0 ? (
        <Aviso
          tom="perigo"
          titulo={`${estouros.length} ${estouros.length === 1 ? "categoria estourou" : "categorias estouraram"} o orçamento deste mês`}
          acao={<Link className="acao-primaria" href="/orcamento">Ver o orçamento</Link>}
          urgente
        >
          {estouros
            .slice(0, 4)
            .map((linha) => `${linha.categoriaNome} (${formatarDinheiro(linha.noMes.diferenca.absoluto())})`)
            .join(" · ")}
        </Aviso>
      ) : null}

      <div className={estilos.grade}>
        {vePagar ? (
        <CartaoResumo
          titulo="Quanto tenho a pagar"
          valor={<ValorFinanceiro valor={totalPagar.paraTexto()} tamanho="destaque" comCor={false} />}
          contagem={`${pagar.total} ${pagar.total === 1 ? "conta" : "contas"} em aberto`}
          explicacao={(pagarVencido.length > 0 ? `${pagarVencido.length} já venceram.` : "Nada vencido.") + parcial(pagar)}
          tom={pagarVencido.length > 0 ? "perigo" : "neutro"}
          rodape={
            // Com vencidas, o atalho leva direto a elas: e a decisao que o cartao pede.
            pagarVencido.length > 0 ? (
              <Link href="/contas-pagar?situacao=vencida">
                Ver {pagarVencido.length === 1 ? "a vencida" : `as ${pagarVencido.length} vencidas`}
              </Link>
            ) : (
              <Link href="/contas-pagar">Ver contas a pagar</Link>
            )
          }
        />
        ) : null}
        {veReceber ? (
        <CartaoResumo
          titulo="Quanto tenho a receber"
          valor={<ValorFinanceiro valor={totalReceber.paraTexto()} tamanho="destaque" comCor={false} />}
          contagem={`${receber.total} ${receber.total === 1 ? "conta" : "contas"} em aberto`}
          explicacao={(receberVencido.length > 0 ? `${receberVencido.length} em atraso.` : "Nada em atraso.") + parcial(receber)}
          tom={receberVencido.length > 0 ? "atencao" : "neutro"}
          rodape={
            receberVencido.length > 0 ? (
              <Link href="/contas-receber?situacao=vencida">
                Ver {receberVencido.length === 1 ? "a atrasada" : `as ${receberVencido.length} atrasadas`}
              </Link>
            ) : (
              <Link href="/contas-receber">Ver contas a receber</Link>
            )
          }
        />
        ) : null}
        {vePagar && veReceber ? (
        <CartaoResumo
          titulo="Diferença entre o que ainda entra e o que ainda sai"
          valor={<ValorFinanceiro valor={totalReceber.subtrair(totalPagar).paraTexto()} tamanho="destaque" />}
          explicacao="Só contas em aberto. Não é o resultado do mês: nada disso aconteceu ainda."
          contagem={`A receber ${formatarDinheiro(totalReceber)} · a pagar ${formatarDinheiro(totalPagar)}`}
        />
        ) : null}
        {resultadoDoMes ? (
        <CartaoResumo
          titulo={resultadoDoMes.indicadores.resultado.ehNegativo() ? "Prejuízo do mês" : "Lucro do mês"}
          valor={<ValorFinanceiro valor={resultadoDoMes.indicadores.resultado.paraTexto()} tamanho="destaque" />}
          explicacao="Pelo dinheiro que entrou e saiu de verdade neste mês."
          contagem={
            resultadoDoMes.indicadores.margem === null
              ? "Sem receita no mês"
              : `Margem de ${resultadoDoMes.indicadores.margem.toLocaleString("pt-BR")}%`
          }
          tom={
            resultadoDoMes.indicadores.resultado.ehNegativo()
              ? "perigo"
              : resultadoDoMes.indicadores.resultado.ehZero()
                ? "neutro"
                : "sucesso"
          }
          rodape={<Link href="/resultados">Ver o demonstrativo</Link>}
        />
        ) : null}
      </div>
    </>
  );
}
