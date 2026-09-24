import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lerCsv } from "@/compartilhado/planilhas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { LoteNaoEncontrado, LoteNaoPodeSerDesfeito } from "../dominio/erros";
import { validarPlanilhaDePessoas } from "../dominio/planilhas";
import { RepositorioImplantacaoDrizzle } from "./repositorio-implantacao-drizzle";

/**
 * Desfazer um lote quando o banco RECUSA: a mensagem e de dominio, nunca a do
 * PostgreSQL.
 *
 * A conferencia de `listarLotes` so enxerga o que o proprio lote criou. Uma
 * pessoa importada e depois usada num titulo lancado A MAO passa por ela — e
 * o `DELETE` cai na chave estrangeira. Antes, o texto cru do banco ("violates
 * foreign key constraint ...", com nome de tabela e de restricao) chegava a
 * tela. Agora vira `LoteNaoPodeSerDesfeito`, com o que fazer.
 */
describe.skipIf(!urlBancoTeste)("desfazer lote de importacao (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioImplantacaoDrizzle(banco as never);
  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    usuarioId = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Implantador', ${`desfazer-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM itens_lote_importacao WHERE lote_id IN (SELECT id FROM lotes_importacao WHERE empresa_id = ${cenario.empresaId})`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM lotes_importacao WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM fornecedores WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM pessoas WHERE organizacao_id = ${cenario.organizacaoId} AND cpf_cnpj = '11222333000181'`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("lote inexistente e erro de dominio", async () => {
    await expect(repositorio.desfazerLote(escopo, "00000000-0000-0000-0000-000000000000", "teste", usuarioId)).rejects.toBeInstanceOf(
      LoteNaoEncontrado,
    );
  });

  it("pessoa importada e usada num titulo lancado a mao: recusa com mensagem de dominio, sem o texto do banco", async () => {
    const { pessoas, erros } = validarPlanilhaDePessoas(
      lerCsv("Nome;Tipo;CPF ou CNPJ;E-mail;Telefone;É cliente;É fornecedor\nFornecedor Usado;jurídica;11222333000181;;;não;sim\n").linhas,
    );
    expect(erros).toEqual([]);
    const { loteId } = await repositorio.importarPessoas(escopo, { arquivoNome: "pessoas.csv", pessoas }, usuarioId);

    // Um titulo lancado A MAO, depois da importacao, para o fornecedor importado.
    const [fornecedor] = await banco.execute<{ id: string }>(sql`
      SELECT f.id::text AS id FROM fornecedores f JOIN pessoas p ON p.id = f.pessoa_id
      WHERE f.empresa_id = ${cenario.empresaId} AND p.cpf_cnpj = '11222333000181'
    `);
    await banco.execute(sql`
      INSERT INTO titulos_pagar (empresa_id, codigo, descricao, fornecedor_id, categoria_id, data_competencia, valor_total, quantidade_parcelas, situacao)
      VALUES (${cenario.empresaId}, 'CP-TESTE-000001', 'Lancado a mao depois da importacao', ${fornecedor!.id}::uuid,
              ${cenario.categoriaId}::uuid, '2026-01-10'::date, '100.00', 1, 'aberto')
    `);

    // A conferencia previa nao enxerga esse titulo (nao veio do lote): o lote ainda se oferece para desfazer.
    const lote = (await repositorio.listarLotes(escopo)).find((l) => l.id === loteId);
    expect(lote?.podeDesfazer).toBe(true);

    let erro: unknown;
    try {
      await repositorio.desfazerLote(escopo, loteId, "teste de regressao", usuarioId);
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeInstanceOf(LoteNaoPodeSerDesfeito);
    const mensagem = (erro as Error).message;
    expect(mensagem).not.toMatch(/violates|constraint|relation|foreign key|fornecedores|pessoas/i);
    expect(mensagem).toMatch(/lançamento/);

    // Nada foi apagado: a transacao voltou inteira.
    const [contagem] = await banco.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM lotes_importacao WHERE id = ${loteId}::uuid AND desfeito_em IS NULL`);
    expect(Number(contagem!.n)).toBe(1);
  });
});
