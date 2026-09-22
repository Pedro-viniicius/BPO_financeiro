import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ArquivoOfxInvalido, dataDoOfx, decodificarOfx, lerOfx, valorDoOfx } from "./ofx";

/**
 * O leitor de OFX contra arquivos de verdade.
 *
 * ATENCAO ao que estes exemplos sao: arquivos ESCRITOS para este teste,
 * seguindo a especificacao OFX e as manias documentadas de cada banco
 * (SGML sem fechar tag no BB, virgula decimal e NAME no Itau, XML e entidades
 * HTML nos bancos digitais). Nao sao extratos capturados de contas reais —
 * nao havia acesso a nenhuma. Quando o primeiro extrato de verdade da Nova
 * Didata chegar, ele deve virar mais um exemplo aqui.
 */

const PASTA = "src/modulos/conciliacao-bancaria/dominio/exemplos-ofx";
const exemplo = (nome: string) => new Uint8Array(readFileSync(join(PASTA, nome)));

describe("codificacao", () => {
  it("le Windows-1252 quando o cabecalho diz CHARSET:1252", () => {
    const texto = decodificarOfx(exemplo("banco-do-brasil-1.02-latin1.ofx"));
    expect(texto).toContain("TARIFA MANUTENÇÃO CONTA");
    expect(texto).not.toContain("�");
  });

  it("le UTF-8 quando o arquivo e XML em UTF-8", () => {
    const texto = decodificarOfx(exemplo("digital-2.11-utf8.ofx"));
    expect(texto).toContain("débito");
    expect(texto).not.toContain("�");
  });

  it("nao produz caractere quebrado em nenhum dos exemplos", () => {
    for (const nome of ["banco-do-brasil-1.02-latin1.ofx", "itau-1.02-latin1.ofx", "digital-2.11-utf8.ofx"]) {
      expect(decodificarOfx(exemplo(nome)), nome).not.toContain("�");
    }
  });
});

describe("Banco do Brasil (OFX 1.02 SGML, latin-1)", () => {
  const extrato = lerOfx(exemplo("banco-do-brasil-1.02-latin1.ofx"));

  it("identifica a conta", () => {
    expect(extrato.conta).toEqual({ codigoBanco: "001", agencia: "1234-5", numeroConta: "98765-4" });
    expect(extrato.moeda).toBe("BRL");
  });

  it("le o periodo e o saldo informado pelo banco", () => {
    expect(extrato.dataInicio).toBe("2026-09-01");
    expect(extrato.dataFim).toBe("2026-09-30");
    expect(extrato.saldoFinalInformado?.paraTexto()).toBe("12267.10");
  });

  it("le os quatro lancamentos com sentido e valor positivo", () => {
    expect(extrato.lancamentos).toHaveLength(4);
    expect(extrato.lancamentos.map((l) => l.tipo)).toEqual(["saida", "entrada", "saida", "entrada"]);
    expect(extrato.lancamentos.map((l) => l.valor.paraTexto())).toEqual(["1000.00", "2500.00", "32.90", "800.00"]);
  });

  it("guarda o FITID, que e a base da deduplicacao", () => {
    expect(extrato.lancamentos.map((l) => l.identificadorExterno)).toEqual([
      "2026090300001",
      "2026090500002",
      "2026091000003",
      "2026091500004",
    ]);
  });

  it("preserva o acento da descricao", () => {
    expect(extrato.lancamentos[2]?.descricao).toBe("TARIFA MANUTENÇÃO CONTA");
  });

  it("nao se perde com tag de valor sem fechamento", () => {
    // `<TRNAMT>-1000.00` termina onde `<FITID>` comeca. Um analisador de XML
    // estrito engasga aqui; o dia inteiro do extrato depende disso funcionar.
    expect(extrato.lancamentos[0]?.descricao).toBe("PAGAMENTO FORNECEDOR PAPELARIA CENTRAL");
    expect(extrato.lancamentos[0]?.data).toBe("2026-09-03");
  });
});

describe("Itau (OFX 1.02 SGML, virgula decimal, NAME junto de MEMO)", () => {
  const extrato = lerOfx(exemplo("itau-1.02-latin1.ofx"));

  it("identifica a conta", () => {
    expect(extrato.conta.codigoBanco).toBe("341");
    expect(extrato.conta.numeroConta).toBe("11111-1");
  });

  it("entende valor com virgula decimal e separador de milhar", () => {
    expect(extrato.lancamentos.map((l) => l.valor.paraTexto())).toEqual(["450.00", "1250.50", "3.17"]);
  });

  it("junta MEMO e NAME na descricao que o usuario reconhece", () => {
    expect(extrato.lancamentos[0]?.descricao).toBe("SISPAG FORNECEDORES · PAPELARIA CENTRAL LTDA");
    expect(extrato.lancamentos[1]?.descricao).toBe("TED RECEBIDA · MARIA SOUZA");
  });

  it("le CHECKNUM como numero do documento", () => {
    expect(extrato.lancamentos[0]?.numeroDocumento).toBe("000123");
    expect(extrato.lancamentos[1]?.numeroDocumento).toBeNull();
  });

  it("aceita data sem hora nem fuso", () => {
    expect(extrato.lancamentos.map((l) => l.data)).toEqual(["2026-09-02", "2026-09-08", "2026-09-20"]);
  });

  it("guarda a linha original para diagnostico", () => {
    expect(extrato.lancamentos[0]?.dadosBrutos).toMatchObject({ TRNTYPE: "DEBIT", TRNAMT: "-450,00" });
  });
});

describe("banco digital (OFX 2.11, XML, UTF-8)", () => {
  const extrato = lerOfx(exemplo("digital-2.11-utf8.ofx"));

  it("le XML com todas as tags fechadas", () => {
    expect(extrato.lancamentos).toHaveLength(2);
    expect(extrato.lancamentos[0]?.valor.paraTexto()).toBe("89.90");
    expect(extrato.lancamentos[1]?.tipo).toBe("entrada");
  });

  it("desfaz as entidades XML da descricao", () => {
    // `&amp;` nomeada e `&#234;` numerica: os dois escapes que geradores de
    // XML de banco usam de verdade.
    expect(extrato.lancamentos[0]?.descricao).toBe("Compra no débito & assinatura");
    expect(extrato.lancamentos[1]?.descricao).toBe("Transferência recebida");
  });

  it("le o carimbo com fuso sem mover o dia", () => {
    // `20260904120000[-03:EST]` e 4 de setembro para o banco e para o cliente.
    expect(extrato.lancamentos[0]?.data).toBe("2026-09-04");
  });
});

describe("arquivos que nao servem", () => {
  it("recusa arquivo vazio", () => {
    expect(() => lerOfx(new Uint8Array())).toThrow(ArquivoOfxInvalido);
  });

  it("recusa arquivo que nao e OFX, explicando o que faltou", () => {
    try {
      lerOfx(exemplo("nao-e-ofx.txt"));
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ArquivoOfxInvalido);
      expect((erro as Error).message).toContain("não parece ser um extrato OFX");
    }
  });

  it("recusa OFX truncado no meio de um lancamento", () => {
    try {
      lerOfx(exemplo("malformado-truncado.ofx"));
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ArquivoOfxInvalido);
    }
  });

  it("recusa OFX valido porem sem lancamentos, dizendo o que fazer", () => {
    try {
      lerOfx(exemplo("sem-lancamentos.ofx"));
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect((erro as Error).message).toContain("período");
    }
  });
});

describe("conversoes", () => {
  it("data ignora hora e fuso", () => {
    expect(dataDoOfx("20260901")).toBe("2026-09-01");
    expect(dataDoOfx("20260901120000")).toBe("2026-09-01");
    expect(dataDoOfx("20260901000000[-3:BRT]")).toBe("2026-09-01");
    expect(dataDoOfx(" 20261231235959[-03:EST] ")).toBe("2026-12-31");
  });

  it("data em formato desconhecido e recusada", () => {
    expect(() => dataDoOfx("01/09/2026")).toThrow(ArquivoOfxInvalido);
    expect(() => dataDoOfx("")).toThrow(ArquivoOfxInvalido);
  });

  it("valor aceita ponto e virgula como decimal", () => {
    expect(valorDoOfx("-1000.00").paraTexto()).toBe("-1000.00");
    expect(valorDoOfx("-1.234,56").paraTexto()).toBe("-1234.56");
    expect(valorDoOfx("1234.56").paraTexto()).toBe("1234.56");
    expect(valorDoOfx("+50").paraTexto()).toBe("50.00");
  });

  it("valor em formato desconhecido e recusado", () => {
    expect(() => valorDoOfx("R$ 10,00")).toThrow(ArquivoOfxInvalido);
    expect(() => valorDoOfx("abc")).toThrow(ArquivoOfxInvalido);
  });
});
