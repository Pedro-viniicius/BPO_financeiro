import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CampoDinheiro } from "./campo-dinheiro";

/**
 * O campo de dinheiro existia no sistema de design e nunca tinha sido usado.
 * O motivo apareceu ao tentar adota-lo: ele nao tinha `name`, entao nao podia
 * ser enviado por formulario nativo — e aqui todo formulario e enviado assim,
 * para funcionar sem JavaScript.
 *
 * Estes testes guardam as duas coisas que fazem dele util: que o valor VIAJA,
 * e que o campo nao e `type="number"`.
 */
describe("CampoDinheiro", () => {
  it("envia o valor: tem name e ja chega preenchido", () => {
    const html = renderToStaticMarkup(<CampoDinheiro id="saldo" name="saldoInicial" valor="1234.56" />);

    expect(html).toContain('name="saldoInicial"');
    // Formatado para leitura, no formato que as acoes de servidor sabem ler.
    expect(html).toContain('value="1.234,56"');
  });

  it("NAO e type=number: a roda do mouse alteraria valores financeiros sem querer", () => {
    const html = renderToStaticMarkup(<CampoDinheiro id="v" name="valor" valor="" />);

    expect(html).toContain('type="text"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).not.toContain('type="number"');
  });

  it("o R$ fica FORA da area editavel e escondido de leitores de tela", () => {
    // Dentro do campo, o simbolo viraria texto a apagar antes de digitar; e
    // lido em voz alta a cada campo, viraria ruido.
    const html = renderToStaticMarkup(<CampoDinheiro id="v" name="valor" valor="" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/R\$<\/span>/);
  });

  it("campo vazio nasce vazio, nao com zero", () => {
    // "0,00" pre-preenchido e o tipo de coisa que alguem envia sem perceber.
    const html = renderToStaticMarkup(<CampoDinheiro id="v" name="valor" valor="" />);
    expect(html).toContain('value=""');
    expect(html).toContain('placeholder="0,00"');
  });

  it("repassa acessibilidade e obrigatoriedade", () => {
    const html = renderToStaticMarkup(
      <CampoDinheiro id="v" name="valor" valor="" required aria-describedby="v-dica" aria-invalid />,
    );
    expect(html).toContain('aria-describedby="v-dica"');
    expect(html).toContain('required=""');
  });
});
