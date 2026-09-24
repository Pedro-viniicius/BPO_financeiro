// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { houveErro, restaurarFormulario } from "./guarda-do-formulario";

function montar(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  return document.querySelector("form")!;
}

describe("estado de erro da acao", () => {
  it("mensagem, erros por campo ou erros por linha contam como erro", () => {
    expect(houveErro({ mensagem: "Confira os campos destacados." })).toBe(true);
    expect(houveErro({ campos: { valor: ["Valor inválido."] } })).toBe(true);
    expect(houveErro({ erros: [{ linha: 2 }] })).toBe(true);
  });

  it("sucesso, estado inicial e estado vazio nao contam", () => {
    expect(houveErro({})).toBe(false);
    expect(houveErro({ sucesso: "Categoria criada." })).toBe(false);
    expect(houveErro({ mensagem: "  ", campos: {} , erros: [] })).toBe(false);
    expect(houveErro(undefined)).toBe(false);
  });
});

describe("restaurar o formulario depois do reinicio", () => {
  it("devolve texto, selecao, area de texto, caixa de marcar e opcao ao que foi enviado", () => {
    const formulario = montar(`
      <input name="descricao" value="" />
      <select name="fornecedorId"><option value="">Escolha</option><option value="f1">Moinho</option></select>
      <textarea name="observacoes"></textarea>
      <input type="checkbox" name="papelFornecedor" />
      <input type="radio" name="modalidade" value="avista" checked />
      <input type="radio" name="modalidade" value="parcelado" />
    `);
    const dados = new FormData();
    dados.set("descricao", "Farinha de trigo");
    dados.set("fornecedorId", "f1");
    dados.set("observacoes", "Entrega na sexta");
    dados.set("papelFornecedor", "on");
    dados.set("modalidade", "parcelado");

    restaurarFormulario(formulario, dados);

    expect((formulario.elements.namedItem("descricao") as HTMLInputElement).value).toBe("Farinha de trigo");
    expect((formulario.elements.namedItem("fornecedorId") as HTMLSelectElement).value).toBe("f1");
    expect((formulario.elements.namedItem("observacoes") as HTMLTextAreaElement).value).toBe("Entrega na sexta");
    expect((formulario.elements.namedItem("papelFornecedor") as HTMLInputElement).checked).toBe(true);
    const radios = formulario.querySelectorAll<HTMLInputElement>("input[name=modalidade]");
    expect(radios[0]!.checked).toBe(false);
    expect(radios[1]!.checked).toBe(true);
  });

  it("nomes repetidos voltam na ordem (linhas de parcelas)", () => {
    const formulario = montar(`<input name="parcelaValor" /><input name="parcelaValor" /><input name="parcelaValor" />`);
    const dados = new FormData();
    for (const valor of ["100,00", "150,00", "200,00"]) dados.append("parcelaValor", valor);

    restaurarFormulario(formulario, dados);

    expect([...formulario.querySelectorAll<HTMLInputElement>("input")].map((campo) => campo.value)).toEqual(["100,00", "150,00", "200,00"]);
  });

  it("nao mexe em senha, campo oculto nem campo desabilitado", () => {
    const formulario = montar(`
      <input type="password" name="senha" value="" />
      <input type="hidden" name="parcelaId" value="p-1" />
      <input type="checkbox" name="bloqueado" checked disabled />
      <input name="$ACTION_REF_1" type="hidden" value="x" />
    `);
    const dados = new FormData();
    dados.set("senha", "segredo-recusado");
    dados.set("parcelaId", "outra");

    restaurarFormulario(formulario, dados);

    expect((formulario.elements.namedItem("senha") as HTMLInputElement).value).toBe("");
    expect((formulario.elements.namedItem("parcelaId") as HTMLInputElement).value).toBe("p-1");
    // Desabilitado nao vai no envio: ausente nao significa desmarcado.
    expect((formulario.elements.namedItem("bloqueado") as HTMLInputElement).checked).toBe(true);
  });

  it("caixa de marcar que foi enviada desmarcada volta desmarcada", () => {
    const formulario = montar(`<input type="checkbox" name="confirmo" value="sim" checked />`);
    restaurarFormulario(formulario, new FormData());
    expect((formulario.elements.namedItem("confirmo") as HTMLInputElement).checked).toBe(false);
  });
});
