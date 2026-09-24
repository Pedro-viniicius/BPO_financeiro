import { ehDataCivil } from "@/compartilhado/datas/data-civil";
import type { SituacaoDerivada } from "@/compartilhado/financeiro/indice";
import { esquemaIdentificador } from "@/compartilhado/validacao/esquemas-comuns";

/**
 * Filtro de lista lido da URL: o que nao e valido conta como ausente.
 *
 * O PROBLEMA. Os filtros das listas vivem na URL, e a URL chega de qualquer
 * lugar: favorito antigo, link colado pela metade, endereco editado a mao.
 * Com `?de=abc` ou `?fornecedor=x`, o valor ia direto para a consulta, o
 * banco recusava e a pessoa via "Não conseguimos carregar esta tela", que
 * culpa o sistema por um endereco torto. Com `?situacao=xyz` a lista vinha
 * vazia enquanto o seletor mostrava "Todas".
 *
 * A DECISAO. Cada chave conhecida tem um validador. Valor invalido vira
 * `undefined` na origem, e por isso some de todo lugar ao mesmo tempo: da
 * consulta, do valor inicial dos campos, da contagem de filtros ativos e dos
 * links do paginador. A lista abre como se o filtro nao existisse.
 */

const SITUACOES_VALIDAS: ReadonlySet<string> = new Set<SituacaoDerivada>(["aberta", "parcial", "vencida", "liquidada", "cancelada"]);

const ehIdentificador = (valor: string): boolean => esquemaIdentificador.safeParse(valor).success;

const VALIDADORES: Readonly<Record<string, (valor: string) => boolean>> = {
  situacao: (valor) => SITUACOES_VALIDAS.has(valor),
  de: ehDataCivil,
  ate: ehDataCivil,
  fornecedor: ehIdentificador,
  cliente: ehIdentificador,
};

export function filtroDaUrl(
  parametros: Readonly<Record<string, string | string[] | undefined>>,
  chave: string,
): string | undefined {
  const bruto = parametros[chave];
  if (typeof bruto !== "string") return undefined;
  const valor = bruto.trim();
  if (!valor) return undefined;
  const validar = VALIDADORES[chave];
  return validar && !validar(valor) ? undefined : valor;
}
