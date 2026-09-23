import { describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { lerCsv } from "@/compartilhado/planilhas/indice";

import { validarPlanilhaDeContas, validarPlanilhaDePessoas } from "./planilhas";

/**
 * A regra que manda: TUDO OU NADA, e todos os erros de uma vez.
 *
 * Importacao pela metade e pior do que nenhuma — a pessoa nao sabe o que
 * entrou, corrige a planilha inteira, importa de novo e duplica o que ja
 * tinha passado. E parar no primeiro erro faria ela descobrir os problemas um
 * por um, com um envio de arquivo entre cada descoberta.
 */

const pessoas = (csv: string) => validarPlanilhaDePessoas(lerCsv(csv).linhas);
const contas = (csv: string, corte = "2025-12-31") =>
  validarPlanilhaDeContas(lerCsv(csv).linhas, dataCivilDeTexto(corte));

const CABECALHO_PESSOAS = "Nome;Tipo;CPF ou CNPJ;E-mail;Telefone;É cliente;É fornecedor";
const CABECALHO_CONTAS = "Tipo;Descrição;Cliente ou fornecedor;Categoria;Competência;Vencimento;Valor;Parcela;Valor já pago;Documento";

describe("planilha de pessoas", () => {
  it("aceita a linha bem preenchida", () => {
    const { pessoas: lidas, erros } = pessoas(`${CABECALHO_PESSOAS}\nNova Didata;jurídica;11.222.333/0001-81;contato@x.com.br;35999990000;não;sim\n`);

    expect(erros).toEqual([]);
    expect(lidas[0]).toMatchObject({
      nome: "Nova Didata",
      tipo: "juridica",
      documento: "11222333000181",
      ehCliente: false,
      ehFornecedor: true,
    });
  });

  it("reprova documento com digito trocado", () => {
    const { erros } = pessoas(`${CABECALHO_PESSOAS}\nX;jurídica;11.222.333/0001-82;;;sim;não\n`);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatchObject({ linha: 2, coluna: "CPF ou CNPJ" });
    expect(erros[0]!.motivo).toMatch(/dígitos/);
  });

  it("deduz o tipo pelo documento quando a coluna vem vazia", () => {
    const { pessoas: lidas, erros } = pessoas(`${CABECALHO_PESSOAS}\nJoão;;529.982.247-25;;;sim;\n`);
    expect(erros).toEqual([]);
    expect(lidas[0]!.tipo).toBe("fisica");
  });

  it("reprova tipo que contradiz o documento", () => {
    const { erros } = pessoas(`${CABECALHO_PESSOAS}\nJoão;jurídica;529.982.247-25;;;sim;\n`);
    expect(erros[0]!.coluna).toBe("Tipo");
    expect(erros[0]!.motivo).toMatch(/física/);
  });

  it("documento REPETIDO no arquivo e erro, nao escolha silenciosa", () => {
    const { erros } = pessoas(
      `${CABECALHO_PESSOAS}\nA;jurídica;11222333000181;;;sim;\nB;jurídica;11.222.333/0001-81;;;sim;\n`,
    );
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatchObject({ linha: 3, coluna: "CPF ou CNPJ" });
    expect(erros[0]!.motivo).toMatch(/linha 2/);
  });

  it("exige que a pessoa seja cliente, fornecedor, ou os dois", () => {
    const { erros } = pessoas(`${CABECALHO_PESSOAS}\nA;jurídica;;;;não;não\n`);
    expect(erros.some((e) => /cliente, fornecedor, ou os dois/.test(e.motivo))).toBe(true);
  });

  it("acumula TODOS os erros da planilha, nao para no primeiro", () => {
    const { erros } = pessoas(`${CABECALHO_PESSOAS}\n;;;email-torto;;sim;\nB;;11122233344;;;sim;\n`);
    expect(erros.length).toBeGreaterThanOrEqual(3);
    expect(new Set(erros.map((e) => e.linha))).toEqual(new Set([2, 3]));
  });
});

describe("planilha de contas", () => {
  const linha = (extras: Partial<Record<string, string>> = {}) => {
    const base: Record<string, string> = {
      tipo: "pagar",
      descricao: "Aluguel dezembro",
      pessoa: "Imobiliária Central",
      categoria: "Aluguel",
      competencia: "",
      vencimento: "20/12/2025",
      valor: "1.500,00",
      parcela: "",
      pago: "",
      documento: "",
    };
    const d = { ...base, ...extras };
    return `${CABECALHO_CONTAS}\n${d.tipo};${d.descricao};${d.pessoa};${d.categoria};${d.competencia};${d.vencimento};${d.valor};${d.parcela};${d.pago};${d.documento}\n`;
  };

  it("aceita a linha bem preenchida e usa o vencimento como competencia", () => {
    const { contas: lidas, erros } = contas(linha());
    expect(erros).toEqual([]);
    expect(lidas[0]!.valor.paraTexto()).toBe("1500.00");
    expect(lidas[0]!.dataCompetencia).toBe("2025-12-20");
    expect(lidas[0]!.numeroParcela).toBe(1);
    expect(lidas[0]!.quantidadeParcelas).toBe(1);
  });

  it("le a parcela no formato 3/10", () => {
    const { contas: lidas, erros } = contas(linha({ parcela: "3/10" }));
    expect(erros).toEqual([]);
    expect(lidas[0]).toMatchObject({ numeroParcela: 3, quantidadeParcelas: 10 });
  });

  it("reprova parcela maior que o total", () => {
    const { erros } = contas(linha({ parcela: "11/10" }));
    expect(erros[0]!.coluna).toBe("Parcela");
  });

  it("reprova data que nao existe no calendario", () => {
    const { erros } = contas(linha({ vencimento: "31/02/2025" }));
    expect(erros.some((e) => e.coluna === "Vencimento")).toBe(true);
  });

  it("aceita os dois formatos de data", () => {
    expect(contas(linha({ vencimento: "2025-12-20" })).erros).toEqual([]);
    expect(contas(linha({ vencimento: "20/12/2025" })).erros).toEqual([]);
  });

  it("reprova vencimento DEPOIS da data de corte", () => {
    const { erros } = contas(linha({ vencimento: "15/01/2026" }));
    expect(erros[0]!.coluna).toBe("Vencimento");
    expect(erros[0]!.motivo).toMatch(/data de corte/);
    expect(erros[0]!.motivo).toMatch(/31\/12\/2025/);
  });

  it("reprova valor ja pago maior que o valor da conta", () => {
    const { erros } = contas(linha({ valor: "100,00", pago: "150,00" }));
    expect(erros[0]!.coluna).toBe("Valor já pago");
  });

  it("le dinheiro no formato brasileiro e no formato cru", () => {
    expect(contas(linha({ valor: "1.234,56" })).contas[0]!.valor.paraTexto()).toBe("1234.56");
    expect(contas(linha({ valor: "1234.56" })).contas[0]!.valor.paraTexto()).toBe("1234.56");
    expect(contas(linha({ valor: "R$ 1.234,56" })).contas[0]!.valor.paraTexto()).toBe("1234.56");
  });

  it("a linha com erro NAO entra na lista de contas a gravar", () => {
    const { contas: lidas, erros } = contas(linha({ valor: "abc" }));
    expect(erros.length).toBeGreaterThan(0);
    expect(lidas).toEqual([]);
  });

  it("exige categoria, porque e ela que leva o lancamento ao resultado", () => {
    const { erros } = contas(linha({ categoria: "" }));
    expect(erros[0]!.coluna).toBe("Categoria");
  });
});
