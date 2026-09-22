import type { NextRequest } from "next/server";

import { dataCivilDeTexto, ehDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import {
  intervaloDoAtalho,
  montarCsvDoResultado,
  nomeDoArquivoCsv,
  NOMES_REGIME,
  REGIMES,
  ATALHOS,
  type AtalhoDePeriodo,
  type Regime,
} from "@/modulos/dre/publico";

import { exigirContextoFinanceiro, repositorios } from "../../_apoio/contexto-financeiro";

/**
 * Download do demonstrativo em CSV.
 *
 * E uma rota de API, e por isso passa pela MESMA guarda das telas
 * (`exigirContextoFinanceiro`): um endereco que devolve arquivo e tao sensivel
 * quanto a pagina que mostra os mesmos numeros, e exportar pede a permissao
 * propria `dre.exportar` — ver o relatorio e uma coisa, levar a planilha
 * inteira embora e outra.
 *
 * Nenhum calculo acontece aqui: o CSV e montado a partir do MESMO resultado
 * que a tela usa. Se o arquivo divergisse da tela, ninguem saberia qual dos
 * dois acreditar.
 */
export async function GET(requisicao: NextRequest): Promise<Response> {
  const { escopo, hoje, nomeEmpresa } = await exigirContextoFinanceiro("dre.exportar", "/resultados");

  const parametros = requisicao.nextUrl.searchParams;
  const ler = (chave: string) => parametros.get(chave)?.trim() || undefined;

  const atalho = (ATALHOS.includes(ler("periodo") as AtalhoDePeriodo) ? ler("periodo") : "mes_atual") as AtalhoDePeriodo;
  const padrao = intervaloDoAtalho(atalho, hoje);
  const data = (chave: string, alternativa: DataCivil): DataCivil => {
    const valor = ler(chave);
    return valor && ehDataCivil(valor) ? dataCivilDeTexto(valor) : alternativa;
  };

  const regime = (REGIMES.includes(ler("regime") as Regime) ? ler("regime") : "caixa") as Regime;
  const conta = regime === "caixa" ? ler("conta") : undefined;

  const filtro = {
    de: data("de", padrao.de),
    ate: data("ate", padrao.ate),
    regime,
    ...(conta ? { contaBancariaId: conta } : {}),
  };

  const resultado = await repositorios.resultados().montar(escopo, filtro, hoje);

  const csv = montarCsvDoResultado(
    {
      empresa: nomeEmpresa,
      regime: NOMES_REGIME[regime],
      periodo: `${filtro.de} a ${filtro.ate}`,
      meses: resultado.meses.map((mes) => mes.rotuloCurto),
    },
    resultado.linhas.map((linha) => ({
      rotulo: linha.rotulo,
      porMes: linha.porMes,
      total: linha.total,
      categorias: linha.categorias,
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoArquivoCsv(regime, filtro.de, filtro.ate)}"`,
      // Relatorio financeiro nao fica em cache de proxy nem de navegador.
      "Cache-Control": "no-store",
    },
  });
}
