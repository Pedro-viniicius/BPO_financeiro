import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TabelaDados } from "./tabela-dados";

/**
 * A tabela compartilhada e usada pelas listas mais abertas do sistema —
 * contas a pagar, contas a receber, bancos, cadastros — e ate o Gate 9 nao
 * tinha NENHUM tratamento para celular, enquanto dez telas que preferiram
 * fazer a propria tabela tinham.
 *
 * O que torna o celular possivel e o `data-rotulo` em cada celula: sem ele, a
 * linha vira um bloco de valores sem dizer o que cada um e. Por isso ele e
 * testado aqui, e nao so escrito no CSS.
 */
const colunas = [
  { chave: "descricao", titulo: "Descrição", celula: (l: { descricao: string }) => l.descricao },
  { chave: "valor", titulo: "Valor", alinhamento: "direita" as const, celula: () => "R$ 10,00" },
];

const linhas = [{ descricao: "Aluguel" }, { descricao: "Energia" }];

describe("TabelaDados", () => {
  const html = renderToStaticMarkup(
    <TabelaDados colunas={colunas} linhas={linhas} chaveDaLinha={(l) => l.descricao} legenda="Contas" />,
  );

  it("leva o titulo da coluna para dentro da celula, para o celular poder mostra-lo", () => {
    expect(html).toContain('data-rotulo="Descrição"');
    expect(html).toContain('data-rotulo="Valor"');
  });

  it("todas as celulas tem rotulo, nao so a primeira", () => {
    const rotulos = html.match(/data-rotulo=/g) ?? [];
    expect(rotulos.length).toBe(colunas.length * linhas.length);
  });

  it("mantem a tabela semantica: cabecalho com escopo e legenda para leitor de tela", () => {
    expect(html).toContain('scope="col"');
    expect(html).toContain("Contas");
    expect(html).toContain("<caption");
  });
});
