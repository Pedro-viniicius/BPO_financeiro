import { inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A situacao derivada de uma parcela, calculada pelo PostgreSQL.
 *
 * Existe uma segunda implementacao da mesma regra em
 * `compartilhado/financeiro/baixa-de-parcela.ts`, em TypeScript — e isso e
 * proposital, mas exige cuidado. A versao TS decide o que a tela mostra; esta
 * decide o que o banco FILTRA e CONTA.
 *
 * Por que o filtro nao pode ser feito em TypeScript: filtrar depois de ler a
 * pagina significa ler 50 linhas, jogar 30 fora e dizer ao usuario que existem
 * 50. Com paginacao de verdade, contas simplesmente sumiriam da lista sem
 * aviso. Contagem e filtro tem de acontecer onde estao os dados.
 *
 * As duas implementacoes sao mantidas em acordo por
 * `situacao-derivada-sql.isolamento.teste.ts`, que roda os mesmos casos nos
 * dois caminhos e compara resultado a resultado contra o banco real.
 *
 * A ordem das clausulas e a mesma da versao TS e importa:
 *   cancelada e liquidada sao FATOS gravados e vencem qualquer calculo
 *   -> so depois olhamos saldo e data (conta quitada ontem nao esta "vencida")
 */

/** Os mesmos valores de `SituacaoDerivada` em `compartilhado/financeiro`. */
export const SITUACOES_DERIVADAS = ["aberta", "parcial", "vencida", "liquidada", "cancelada"] as const;

export type SituacaoDerivadaSql = (typeof SITUACOES_DERIVADAS)[number];

export interface ColunasDaParcela {
  readonly situacao: AnyPgColumn;
  readonly valorOriginal: AnyPgColumn;
  /** `valor_pago` em contas a pagar, `valor_recebido` em contas a receber. */
  readonly valorBaixado: AnyPgColumn;
  readonly dataVencimento: AnyPgColumn;
}

export function situacaoDerivadaSql(colunas: ColunasDaParcela, hoje: string): SQL<SituacaoDerivadaSql> {
  return sql<SituacaoDerivadaSql>`
    CASE
      WHEN ${colunas.situacao} = 'cancelada' THEN 'cancelada'
      WHEN ${colunas.situacao} = 'liquidada' THEN 'liquidada'
      WHEN ${colunas.valorOriginal} - ${colunas.valorBaixado} <= 0 THEN 'liquidada'
      WHEN ${colunas.dataVencimento} < ${hoje}::date THEN 'vencida'
      WHEN ${colunas.valorBaixado} > 0 THEN 'parcial'
      ELSE 'aberta'
    END
  `;
}

/** Condicao para o `where`: a situacao derivada esta entre as escolhidas. */
export function filtroPorSituacaoDerivada(
  colunas: ColunasDaParcela,
  hoje: string,
  situacoes: readonly SituacaoDerivadaSql[],
): SQL {
  return inArray(situacaoDerivadaSql(colunas, hoje), [...situacoes]);
}
