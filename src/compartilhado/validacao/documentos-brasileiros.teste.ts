import { describe, expect, it } from "vitest";

import { formatarCnpj, formatarCpf, normalizarCpfOuCnpj, validarCnpj, validarCpf } from "./documentos-brasileiros";

describe("CPF e CNPJ", () => {
  it("valida CPF com e sem pontuacao", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
    expect(validarCpf("529.982.247-26")).toBe(false);
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("123")).toBe(false);
  });

  it("valida CNPJ com e sem pontuacao", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11222333000181")).toBe(true);
    expect(validarCnpj("11.222.333/0001-82")).toBe(false);
    expect(validarCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("normaliza e formata", () => {
    expect(normalizarCpfOuCnpj("529.982.247-25")).toEqual({ tipo: "cpf", digitos: "52998224725" });
    expect(normalizarCpfOuCnpj("11222333000181")).toEqual({ tipo: "cnpj", digitos: "11222333000181" });
    expect(() => normalizarCpfOuCnpj("abc")).toThrow(SyntaxError);
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
