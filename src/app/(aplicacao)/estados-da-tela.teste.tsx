import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Carregando from "./loading";
import Erro from "./error";

/**
 * As telas de CARREGAMENTO e de ERRO.
 *
 * Elas quase nunca aparecem, e por isso costumam ser as menos testadas de um
 * sistema — e as que mais custam quando aparecem. Antes deste gate elas nao
 * existiam: quem via uma falha recebia a pagina generica do Next.js, "A server
 * error occurred", que nao diz o que houve nem o que fazer.
 *
 * O que estes testes guardam e justamente o que e facil regredir sem perceber:
 * que a tela de erro NAO vaze detalhe tecnico, e que ela ofereca uma saida.
 */

const erroFalso = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
  digest: "3847216590",
});

describe("tela de erro do sistema", () => {
  const html = renderToStaticMarkup(<Erro error={erroFalso} reset={() => {}} />);

  it("explica o que aconteceu em linguagem de usuario", () => {
    expect(html).toContain("Não conseguimos carregar esta tela");
    expect(html).toContain("instabilidade momentânea");
  });

  it("diz que NENHUM lancamento foi alterado", () => {
    // E a primeira duvida de quem estava dando uma baixa quando a tela falhou.
    expect(html).toContain("Nenhum lançamento foi alterado");
  });

  it("oferece saida: tentar de novo e voltar ao inicio", () => {
    expect(html).toContain("Tentar de novo");
    expect(html).toContain("Voltar para o início");
    expect(html).toContain('href="/inicio"');
  });

  it("NAO vaza detalhe tecnico nenhum para a tela", () => {
    for (const vazamento of ["ECONNREFUSED", "127.0.0.1", "5432", "postgres", "Error:", "stack", "node_modules"]) {
      expect(html, `a tela de erro vazou "${vazamento}"`).not.toContain(vazamento);
    }
  });

  it("mostra o codigo do erro, que e o que liga a tela ao log do servidor", () => {
    // Sem ele, "deu erro ontem de manha" e tudo o que o suporte recebe.
    expect(html).toContain("3847216590");
  });

  it("funciona quando nao ha codigo: pede o horario no lugar", () => {
    const semDigest = renderToStaticMarkup(<Erro error={new Error("qualquer")} reset={() => {}} />);
    expect(semDigest).toContain("horário em que aconteceu");
    expect(semDigest).not.toContain("qualquer");
  });
});

describe("tela de carregamento", () => {
  const html = renderToStaticMarkup(<Carregando />);

  it("anuncia o carregamento a quem usa leitor de tela", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain("Carregando a tela");
  });

  it("imita a forma da pagina, para o conteudo real nao fazer o layout pular", () => {
    // Cabecalho, tres cartoes de resumo e uma lista: a forma das telas do sistema.
    const barras = html.match(/aria-hidden="true"/g) ?? [];
    expect(barras.length).toBeGreaterThan(8);
  });

  it("o esqueleto decorativo fica escondido dos leitores de tela", () => {
    // So a descricao e anunciada; repetir "barra, barra, barra" seria ruido.
    expect(html).toContain('aria-hidden="true"');
  });
});
