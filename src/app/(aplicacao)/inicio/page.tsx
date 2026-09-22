import Link from "next/link";

import { inicioDoMes, fimDoMes } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { CabecalhoPagina, CartaoResumo, EstadoVazio, ValorFinanceiro } from "@/interface/componentes/indice";

import { formatarDinheiro } from "../_apoio/apresentacao";
import { exigirContextoFinanceiro, repositorios } from "../_apoio/contexto-financeiro";
import estilos from "./inicio.module.css";

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

  const paginacao = { pagina: 1, tamanho: 500 };
  const vazio = { itens: [], total: 0, pagina: 1, tamanho: paginacao.tamanho };
  /*
   * O resultado do mes vem do MODULO DE RESULTADOS, a mesma fonte da tela
   * `/resultados`. Recalcular aqui "so o numerinho do painel" e como dois
   * relogios na mesma parede: mais cedo ou mais tarde eles discordam, e nao ha
   * como saber qual esta certo.
   */
  const mes = { de: inicioDoMes(hoje), ate: fimDoMes(hoje), regime: "caixa" as const };
  const [pagar, receber, resultadoDoMes] = await Promise.all([
    vePagar ? repositorios.contasPagar().listar(escopo, {}, paginacao, hoje) : vazio,
    veReceber ? repositorios.contasReceber().listar(escopo, {}, paginacao, hoje) : vazio,
    veResultado ? repositorios.resultados().montar(escopo, mes, hoje) : null,
  ]);

  const emAberto = <T extends { situacao: string }>(itens: readonly T[]) =>
    itens.filter((i) => i.situacao !== "liquidada" && i.situacao !== "cancelada");
  const vencidas = <T extends { situacao: string }>(itens: readonly T[]) => itens.filter((i) => i.situacao === "vencida");

  const aPagar = emAberto(pagar.itens);
  const aReceber = emAberto(receber.itens);
  const pagarVencido = vencidas(pagar.itens);
  const receberVencido = vencidas(receber.itens);

  const totalPagar = Dinheiro.somarTodos(aPagar.map((i) => i.saldo));
  const totalReceber = Dinheiro.somarTodos(aReceber.map((i) => i.saldo));

  if (!vePagar && !veReceber && !veResultado) {
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

  if (pagar.itens.length === 0 && receber.itens.length === 0 && !resultadoDoMes?.temDados) {
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

      <div className={estilos.grade}>
        {vePagar ? (
        <CartaoResumo
          titulo="Quanto tenho a pagar"
          valor={<ValorFinanceiro valor={totalPagar.paraTexto()} tamanho="destaque" comCor={false} />}
          contagem={`${aPagar.length} ${aPagar.length === 1 ? "conta" : "contas"} em aberto`}
          explicacao={pagarVencido.length > 0 ? `${pagarVencido.length} já venceram` : "Nada vencido"}
          tom={pagarVencido.length > 0 ? "perigo" : "neutro"}
          rodape={<Link href="/contas-pagar">Ver contas a pagar</Link>}
        />
        ) : null}
        {veReceber ? (
        <CartaoResumo
          titulo="Quanto tenho a receber"
          valor={<ValorFinanceiro valor={totalReceber.paraTexto()} tamanho="destaque" comCor={false} />}
          contagem={`${aReceber.length} ${aReceber.length === 1 ? "conta" : "contas"} em aberto`}
          explicacao={receberVencido.length > 0 ? `${receberVencido.length} em atraso` : "Nada em atraso"}
          tom={receberVencido.length > 0 ? "atencao" : "neutro"}
          rodape={<Link href="/contas-receber">Ver contas a receber</Link>}
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
          tom={resultadoDoMes.indicadores.resultado.ehNegativo() ? "perigo" : "sucesso"}
          rodape={<Link href="/resultados">Ver o demonstrativo</Link>}
        />
        ) : null}
      </div>
    </>
  );
}
