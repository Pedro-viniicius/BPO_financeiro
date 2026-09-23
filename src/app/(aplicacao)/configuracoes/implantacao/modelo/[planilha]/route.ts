import { modeloDeContas, modeloDePessoas } from "@/modulos/implantacao/publico";

import { exigirContextoFinanceiro } from "../../../../_apoio/contexto-financeiro";

/**
 * Baixa a planilha modelo.
 *
 * Rota, e nao arquivo estatico, por duas razoes: o modelo e gerado a partir da
 * MESMA lista de colunas que a validacao usa — um arquivo parado no disco
 * ficaria desatualizado na primeira coluna nova, e a pessoa preencheria um
 * modelo que o sistema nao aceita mais — e porque baixar exige permissao, como
 * tudo o mais.
 */
export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ planilha: string }> },
) {
  await exigirContextoFinanceiro("importacao.executar", "/configuracoes/implantacao");

  const { planilha } = await params;
  const [tipo, formato] = planilha.replace(/\.(csv|xlsx)$/, (extensao) => `|${extensao.slice(1)}`).split("|");

  if ((tipo !== "pessoas" && tipo !== "contas") || (formato !== "csv" && formato !== "xlsx")) {
    return new Response("Modelo não encontrado.", { status: 404 });
  }

  const modelo = tipo === "pessoas" ? modeloDePessoas(formato) : modeloDeContas(formato);
  const corpo = typeof modelo.conteudo === "string" ? modelo.conteudo : new Uint8Array(modelo.conteudo);

  return new Response(corpo, {
    headers: {
      "Content-Type": modelo.tipo,
      "Content-Disposition": `attachment; filename="${modelo.nome}"`,
      // O modelo muda quando as colunas mudam: nunca servir de cache.
      "Cache-Control": "no-store",
    },
  });
}
