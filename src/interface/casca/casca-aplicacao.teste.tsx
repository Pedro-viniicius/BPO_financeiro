import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PERMISSOES_POR_PAPEL } from "@/nucleo/autorizacao/publico";

import { CascaAplicacao, navegacaoVisivel } from "./casca-aplicacao";

describe("CascaAplicacao", () => {
  it("renderiza cabecalho, navegacao filtrada, conteudo e barra inferior", () => {
    const html = renderToStaticMarkup(
      <CascaAplicacao
        cabecalho={{ nomeDaEmpresa: "Padaria São Jorge", nomeDoUsuario: "Márcia", papelDoUsuario: "Administrador" }}
        grupos={navegacaoVisivel(PERMISSOES_POR_PAPEL.tesouraria)}
      >
        <p>conteudo</p>
      </CascaAplicacao>,
    );

    expect(html).toContain("Pular para o conteúdo");
    expect(html).toContain("Padaria São Jorge");
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('id="conteudo"');
    expect(html).toContain("Bancos e caixa");
    // Tesouraria nao tem dre.visualizar nem orcamento.visualizar: itens ausentes do HTML.
    expect(html).not.toContain("Resultados");
    expect(html).not.toContain("Orçamento");
    expect(html).toContain('aria-label="Navegação rápida"');
  });
});
