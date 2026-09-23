import { exigirContextoFinanceiro, repositorios } from "../../../_apoio/contexto-financeiro";

/**
 * Baixa o pacote com TODOS os dados da empresa.
 *
 * Exige `configuracao.gerenciar`, e nao `exportacao.executar`: este pacote
 * inclui a lista de usuarios e a auditoria inteira, e `exportacao.executar`
 * esta em papeis que exportam um demonstrativo — coisa bem mais estreita.
 * `exigirAcesso` com lista significa "qualquer uma destas", entao nao ha como
 * exigir as duas; entre as duas do catalogo, a de administrador e a certa.
 *
 * Geracao SINCRONA: para um cliente deste porte o pacote sai em menos de um
 * segundo. Se um dia demorar, o caminho e gerar em segundo plano e avisar
 * quando terminar — esta registrado como pendencia, e nao vale a complexidade
 * antes de existir o problema.
 */
export async function GET() {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("configuracao.gerenciar", "/configuracoes/exportacao");

  const pacote = await repositorios.exportacao().exportar(escopo, usuarioId);

  return new Response(new Uint8Array(pacote.conteudo), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pacote.nome}"`,
      "Content-Length": String(pacote.conteudo.length),
      // A soma viaja no cabecalho: quem quiser conferir que o download chegou
      // inteiro compara com `sha256sum` do arquivo baixado.
      "X-Soma-SHA256": pacote.soma,
      "Cache-Control": "no-store",
    },
  });
}
