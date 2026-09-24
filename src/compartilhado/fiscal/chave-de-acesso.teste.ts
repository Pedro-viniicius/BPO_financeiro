import { describe, expect, it } from "vitest";

import { ChaveDeAcessoInvalida, digitoVerificador, extrairChaveDeTexto, interpretarChaveDeAcesso, normalizarChaveDeAcesso } from "./chave-de-acesso";

/*
 * As chaves abaixo tiveram o DV calculado por uma implementacao INDEPENDENTE
 * (Python, na sessao do Gate 10), nao por esta. A alfanumerica segue a NT
 * 2025.001: 12 posicoes do CNPJ com letras, DV do CNPJ numerico.
 */
const LEGADA = "35260912345678000195550010000001231123456784";
const ALFANUMERICA = "31260112ABC34501DE35650020000045671876543213";

function motivo(texto: string): string | null {
  try {
    interpretarChaveDeAcesso(texto);
    return null;
  } catch (erro) {
    return erro instanceof ChaveDeAcessoInvalida ? erro.motivo : "outro";
  }
}

describe("chave de acesso: interpretacao por posicao", () => {
  it("le UF, ano-mes, CNPJ, modelo, serie e numero de uma chave legada", () => {
    expect(interpretarChaveDeAcesso(LEGADA)).toEqual({
      chave: LEGADA,
      uf: "SP",
      emissao: "2026-09-01",
      anoMes: "09/2026",
      cnpjEmitente: "12345678000195",
      modelo: "55",
      nomeDoModelo: "NF-e",
      serie: "1",
      numero: "123",
    });
  });

  it("aceita CNPJ alfanumerico (NT 2025.001) e o DV usa ASCII-48: 'A' vale 17", () => {
    const lida = interpretarChaveDeAcesso(ALFANUMERICA);
    expect(lida.cnpjEmitente).toBe("12ABC34501DE35");
    expect(lida).toMatchObject({ uf: "MG", emissao: "2026-01-01", modelo: "65", nomeDoModelo: "NFC-e", serie: "2", numero: "4567" });
    expect(digitoVerificador(ALFANUMERICA.slice(0, 43))).toBe("3");
  });

  it("normaliza o que a pessoa colou: minusculas, espacos, pontos e tracos", () => {
    const suja = " 3526 0912.345678-000195 5500 1000 0001 2311 2345 6784 ";
    expect(normalizarChaveDeAcesso(suja)).toBe(LEGADA);
    expect(interpretarChaveDeAcesso(ALFANUMERICA.toLowerCase()).chave).toBe(ALFANUMERICA);
  });

  it("recusa, dizendo o motivo: formato, digito trocado, UF inexistente, mes e modelo invalidos", () => {
    expect(motivo("123")).toBe("formato");
    expect(motivo(LEGADA.slice(0, 43) + "5")).toBe("digito");
    // Um caractere trocado no meio tambem muda o DV.
    expect(motivo(LEGADA.slice(0, 10) + "9" + LEGADA.slice(11))).toBe("digito");
    const ufRuim = "99" + LEGADA.slice(2, 43);
    expect(motivo(ufRuim + digitoVerificador(ufRuim))).toBe("uf");
    const mesRuim = LEGADA.slice(0, 4) + "13" + LEGADA.slice(6, 43);
    expect(motivo(mesRuim + digitoVerificador(mesRuim))).toBe("mes");
    const modeloRuim = LEGADA.slice(0, 20) + "57" + LEGADA.slice(22, 43);
    expect(motivo(modeloRuim + digitoVerificador(modeloRuim))).toBe("modelo");
  });

  it("acha a chave DENTRO da URL do QR da NFC-e, e nao trata a URL como chave", () => {
    const url = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${LEGADA}|2|1|1|ABCDEF0123456789`;
    expect(extrairChaveDeTexto(url)).toBe(LEGADA);
    expect(extrairChaveDeTexto(`chave: ${ALFANUMERICA.toLowerCase()}`)).toBe(ALFANUMERICA);
    expect(extrairChaveDeTexto("0".repeat(60))).toBeNull();
    expect(extrairChaveDeTexto("nada aqui")).toBeNull();
  });
});
