import { ehErroDominio } from "@/compartilhado/erros/indice";
import { montarArmazenamentoArquivos } from "@/composicao/arquivos";

import { exigirContextoFinanceiro, repositorios } from "../../../../_apoio/contexto-financeiro";

/**
 * Uma exportacao de anexos por vez por empresa: o pacote e montado em
 * memoria, e duas ao mesmo tempo dobrariam o pico. O controle e em processo
 * — a producao roda uma replica (ADR-009) — e falha com 409, em portugues.
 */
const emAndamento = new Set<string>();

export async function GET(_requisicao: Request, { params }: { params: Promise<{ mes: string }> }) {
  const { mes } = await params;
  const { escopo, usuarioId } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes/exportacao");
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("Parte inválida.", { status: 400 });

  if (emAndamento.has(escopo.empresaId)) {
    return new Response("Já há uma exportação de anexos em andamento para esta empresa. Aguarde ela terminar.", {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  emAndamento.add(escopo.empresaId);
  try {
    const armazenamento = montarArmazenamentoArquivos(escopo.empresaId);
    const pacote = await repositorios.exportacao().exportarAnexosDoMes(escopo, mes, usuarioId, (chave) => armazenamento.obter(chave));
    return new Response(new Uint8Array(pacote.conteudo), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pacote.nome}"`,
        "Content-Length": String(pacote.conteudo.length),
        "X-Soma-SHA256": pacote.soma,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    if (ehErroDominio(erro)) return new Response(erro.message, { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw erro;
  } finally {
    emAndamento.delete(escopo.empresaId);
  }
}
