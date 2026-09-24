import { describe, expect, it } from "vitest";

import { ehErroDominio } from "@/compartilhado/erros/indice";

import { LoteNaoEncontrado, LoteNaoPodeSerDesfeito, MOTIVO_ITEM_EM_USO } from "./erros";

describe("erros da carga inicial", () => {
  it("sao erros de dominio, com mensagem pronta para a tela", () => {
    expect(ehErroDominio(new LoteNaoEncontrado())).toBe(true);
    expect(ehErroDominio(new LoteNaoPodeSerDesfeito("Já foi desfeito."))).toBe(true);
    expect(new LoteNaoPodeSerDesfeito(MOTIVO_ITEM_EM_USO).message).toBe(MOTIVO_ITEM_EM_USO);
  });

  it("a mensagem de item em uso nao repete o vocabulario do banco", () => {
    expect(MOTIVO_ITEM_EM_USO).not.toMatch(/violates|constraint|relation|foreign key|pessoas|fornecedores/i);
  });
});
