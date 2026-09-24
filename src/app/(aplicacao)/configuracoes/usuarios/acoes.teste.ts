import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A acao de redefinir acesso NUNCA devolve o link para a tela.
 *
 * Quem tem o link define a senha de outra pessoa e entra como ela. Se algum
 * dia o `link:` voltar a resposta de `acaoRedefinirAcesso`, o administrador
 * volta a receber uma credencial alheia — e a auditoria volta a poder ser
 * escrita em nome de outro. A varredura le o arquivo, como as demais guardas
 * de tela deste projeto, porque a acao exige sessao e nao roda fora do Next.
 */
describe("acao de redefinir acesso", () => {
  const conteudo = readFileSync("src/app/(aplicacao)/configuracoes/usuarios/acoes.ts", "utf-8");
  const inicio = conteudo.indexOf("export async function acaoRedefinirAcesso");
  const fim = conteudo.indexOf("\nexport async function ", inicio + 1);
  const bloco = conteudo.slice(inicio, fim === -1 ? undefined : fim);

  it("a acao existe e foi encontrada pela varredura", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(bloco).toContain("redefinirAcesso(");
  });

  it("nao devolve `link` na resposta", () => {
    expect(bloco).not.toMatch(/\blink\s*:/);
    expect(bloco).not.toMatch(/linkDoConvite\(/);
  });

  it("entrega o link por e-mail ao dono da conta, ou orienta a usar 'Esqueci minha senha'", () => {
    expect(bloco).toContain("montarMensagemRedefinicaoAcesso(");
    expect(bloco).toContain("Esqueci minha senha");
  });

  it("o convite de conta NOVA continua mostrando o link (nao ha conta a proteger)", () => {
    const convidar = conteudo.slice(conteudo.indexOf("export async function acaoConvidar"), inicio);
    expect(convidar).toMatch(/\blink\s*:/);
  });
});
