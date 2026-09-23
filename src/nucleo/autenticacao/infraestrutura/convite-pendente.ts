import { and, gt, isNull, sql } from "drizzle-orm";

import { convites } from "@/banco-dados/esquemas/indice";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";

/**
 * Existe convite valido para este e-mail?
 *
 * O cadastro publico e fechado em producao depois do primeiro usuario, e a
 * porta que sobra e o convite. Quem decide se uma criacao de conta pode
 * acontecer e a camada de autenticacao — entao e aqui que a pergunta "isto
 * foi autorizado?" precisa ser respondida.
 *
 * A consulta le a tabela pelo agregador de esquemas, e nao pelo `publico.ts`
 * de `empresas`, de proposito: aquele arquivo carrega as acoes de empresa, que
 * por sua vez dependem da autenticacao. Importar dali criaria um ciclo na
 * inicializacao.
 */
export async function existeConvitePendentePara(email: string): Promise<boolean> {
  const agora = new Date();
  const [linha] = await obterBancoDados()
    .select({ existe: sql<number>`1` })
    .from(convites)
    .where(
      and(
        sql`lower(${convites.email}) = ${email.trim().toLowerCase()}`,
        isNull(convites.aceitoEm),
        isNull(convites.canceladoEm),
        gt(convites.expiraEm, agora),
      ),
    )
    .limit(1);

  return Boolean(linha);
}
