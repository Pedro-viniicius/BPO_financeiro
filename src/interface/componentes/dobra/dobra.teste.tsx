import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dobra } from "./dobra";

/**
 * A dobra existe para dois motivos, e os dois sao testados aqui.
 *
 * O primeiro e FUNCIONAR SEM JAVASCRIPT: se ela virasse um `<button>` com
 * estado, estornar uma baixa passaria a exigir JavaScript — e estorno e
 * justamente a operacao que alguem precisa fazer quando algo ja deu errado.
 *
 * O segundo e CONSISTENCIA: o mesmo controle estava copiado em nove arquivos
 * de estilo e ja tinha divergido em duas aparencias.
 */
describe("Dobra", () => {
  it("usa details e summary de verdade, que abrem sem JavaScript", () => {
    const html = renderToStaticMarkup(
      <Dobra rotulo="Estornar">
        <p>formulário</p>
      </Dobra>,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Estornar");
    expect(html).toContain("formulário");
    // Sem `onclick` no HTML: quem abre e o proprio navegador.
    expect(html).not.toContain("onclick");
  });

  it("nasce FECHADA quando ninguem controla a abertura", () => {
    const html = renderToStaticMarkup(<Dobra rotulo="Cancelar conta"><p>x</p></Dobra>);
    expect(html).not.toContain("open");
  });

  it("obedece a tela quando a abertura e controlada", () => {
    const aberta = renderToStaticMarkup(<Dobra rotulo="Estornar" aberta><p>x</p></Dobra>);
    const fechada = renderToStaticMarkup(<Dobra rotulo="Estornar" aberta={false}><p>x</p></Dobra>);

    expect(aberta).toContain("open");
    expect(fechada).not.toContain('open=""');
  });

  it("o destaque e opcional: se toda dobra se destacasse, nenhuma se destacaria", () => {
    const comum = renderToStaticMarkup(<Dobra rotulo="Ignorar"><p>x</p></Dobra>);
    const destacada = renderToStaticMarkup(<Dobra rotulo="Convidar pessoa" destaque><p>x</p></Dobra>);

    const classeDoComum = /<summary class="([^"]+)"/.exec(comum)?.[1] ?? "";
    const classeDoDestacado = /<summary class="([^"]+)"/.exec(destacada)?.[1] ?? "";
    expect(classeDoDestacado.length).toBeGreaterThan(classeDoComum.length);
  });

  it("dispensa a caixa quando o conteudo ja e uma", () => {
    const html = renderToStaticMarkup(<Dobra rotulo="Ver" comCaixa={false}><table /></Dobra>);
    expect(html).toContain("<table");
  });
});
