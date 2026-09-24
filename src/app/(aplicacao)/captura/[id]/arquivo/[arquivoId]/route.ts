import { montarArmazenamentoArquivos } from "@/composicao/arquivos";

import { exigirContextoFinanceiro, repositorios } from "../../../../_apoio/contexto-financeiro";

/**
 * Entrega um anexo a equipe — SEMPRE como download (`attachment`), com o tipo
 * que o sistema detectou pelo conteudo, nunca o declarado por quem enviou.
 * O arquivo nao e interpretado aqui (ADR-032): quem o abre e o programa do
 * computador da pessoa. `nosniff` ja vem do cabecalho global.
 */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ id: string; arquivoId: string }> }) {
  const { id, arquivoId } = await params;
  const { escopo } = await exigirContextoFinanceiro("captura.visualizar", `/captura/${id}`);

  const anexo = await repositorios.captura().obterAnexo(escopo, id, arquivoId);
  if (!anexo) return new Response("Arquivo não encontrado.", { status: 404 });

  const conteudo = await montarArmazenamentoArquivos(escopo.empresaId).obter(anexo.chaveArmazenamento);
  if (!conteudo) return new Response("O conteúdo deste arquivo não está mais disponível.", { status: 404 });

  const nome = anexo.nomeOriginal.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "arquivo";
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.tipoConteudo,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Content-Length": String(conteudo.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
