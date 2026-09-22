import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CabecalhoAplicacao } from "../casca/cabecalho-aplicacao";
import { CascaSimples } from "../casca/casca-simples";
import { MARCA } from "./identidade";
import { Logotipo, LogotipoOficial } from "./logotipo";

/**
 * A marca nao pode estar escrita dentro das telas: ela vem de `identidade.ts`.
 * Estes testes falham se alguem voltar a fixar um nome no meio de um
 * componente — que e exatamente o que impediria trocar de marca depois.
 */
describe("marca", () => {
  it("o logotipo usa o nome da identidade e tem texto alternativo", () => {
    const html = renderToStaticMarkup(<Logotipo comAssinatura />);
    expect(html).toContain(MARCA.nome);
    expect(html).toContain(MARCA.assinatura);
    expect(html).toContain(`aria-label="Símbolo da ${MARCA.nome}"`);
  });

  it("as cores do simbolo vem de tokens, nunca de hexadecimal solto", () => {
    const html = renderToStaticMarkup(<Logotipo />);
    expect(html).toContain("var(--cor-marca-forte)");
    expect(html).not.toMatch(/fill="#[0-9a-f]{3,8}"/i);
  });

  it("a arte oficial descreve a marca para quem usa leitor de tela", () => {
    const html = renderToStaticMarkup(<LogotipoOficial />);
    expect(html).toMatch(/alt="[^"]*"/);
    expect(html).toContain(MARCA.nome);
    expect(html).toContain(MARCA.assinatura);
  });

  it("a casca de entrada mostra a marca atual", () => {
    const html = renderToStaticMarkup(
      <CascaSimples>
        <p>conteudo</p>
      </CascaSimples>,
    );
    expect(html).toContain(MARCA.nome);
  });

  it("o cabecalho do sistema mostra a marca e a empresa ativa", () => {
    const html = renderToStaticMarkup(
      <CabecalhoAplicacao nomeDaEmpresa="Empresa Exemplo" nomeDoUsuario="Márcia" papelDoUsuario="Administrador" />,
    );
    expect(html).toContain(MARCA.nome);
    expect(html).toContain("Empresa Exemplo");
  });

  it("nenhuma marca anterior sobrou na camada de interface", () => {
    // Guarda contra reintroducao acidental da identidade de outro cliente.
    const html =
      renderToStaticMarkup(<Logotipo comAssinatura />) +
      renderToStaticMarkup(
        <CascaSimples>
          <p>conteudo</p>
        </CascaSimples>,
      );
    expect(html).not.toMatch(/Essencial/i);
  });
});
