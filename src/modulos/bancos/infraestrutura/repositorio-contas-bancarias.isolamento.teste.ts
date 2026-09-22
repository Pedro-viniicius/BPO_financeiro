import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { RepositorioContasBancariasDrizzle } from "./repositorio-contas-bancarias-drizzle";

/** Isolamento de contas bancarias — controle 3 da ADR-017. */
describe.skipIf(!urlBancoTeste)("isolamento de contas bancarias (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasBancariasDrizzle(banco as never);
  let a: CenarioBase, b: CenarioBase, escopoA: EscopoEmpresa, escopoB: EscopoEmpresa;

  const escopoDe = (c: CenarioBase): EscopoEmpresa => ({
    organizacaoId: comoIdentificador<"Organizacao">(c.organizacaoId),
    empresaId: comoIdentificador<"Empresa">(c.empresaId),
  });

  beforeAll(async () => {
    a = await criarCenarioBase(banco as BancoTeste);
    b = await criarCenarioBase(banco as BancoTeste);
    escopoA = escopoDe(a);
    escopoB = escopoDe(b);
  });

  afterAll(async () => {
    for (const c of [a, b]) if (c) await apagarCenarioBase(banco as BancoTeste, c);
    await cliente.end();
  });

  it("cada empresa ve apenas as proprias contas", async () => {
    const listaA = await repositorio.listar(escopoA);
    const listaB = await repositorio.listar(escopoB);
    const idsA = listaA.map((c) => c.id);
    const idsB = listaB.map((c) => c.id);

    expect(idsA).toContain(a.contaBancariaId);
    expect(idsA).not.toContain(b.contaBancariaId);
    expect(idsB).toContain(b.contaBancariaId);
    expect(idsB).not.toContain(a.contaBancariaId);
  });

  it("A nao abre a conta bancaria de B mesmo sabendo o UUID", async () => {
    expect(await repositorio.buscarPorId(escopoA, b.contaBancariaId)).toBeNull();
    expect(await repositorio.buscarPorId(escopoB, a.contaBancariaId)).toBeNull();
    expect(await repositorio.buscarPorId(escopoA, a.contaBancariaId)).not.toBeNull();
  });

  it("A nao edita a conta bancaria de B mesmo sabendo o UUID", async () => {
    // Recusa com o MESMO erro de um id inexistente: a resposta nao revela que
    // a conta existe em outra empresa.
    await expect(repositorio.editar(escopoA, b.contaBancariaId, { nome: "INVADIDA", tipo: "caixa" })).rejects.toThrow(
      "CONTA_BANCARIA_NAO_ENCONTRADA",
    );
    const intacta = await repositorio.buscarPorId(escopoB, b.contaBancariaId);
    expect(intacta?.nome).not.toBe("INVADIDA");
  });

  it("o saldo comeca no saldo inicial e acompanha as movimentacoes", async () => {
    const { contaId } = await repositorio.criar(escopoA, {
      nome: "Conta de teste de saldo",
      tipo: "conta_corrente",
      instituicaoBancariaId: a.instituicaoId,
      saldoInicial: Dinheiro.deTexto("100.00"),
      dataSaldoInicial: dataCivilDeTexto("2026-01-01"),
    });
    expect((await repositorio.buscarPorId(escopoA, contaId))?.saldoAtual.paraTexto()).toBe("100.00");

    await banco.execute(sql`
      INSERT INTO movimentacoes_bancarias (empresa_id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, origem)
      VALUES (${a.empresaId}, ${contaId}, '2026-02-01', 'entrada', '250.00', 'Entrada de teste', 'ajuste_manual'),
             (${a.empresaId}, ${contaId}, '2026-02-02', 'saida',   '50.00',  'Saida de teste',   'ajuste_manual')
    `).catch(async () => {
      // `ajuste_manual` exige categoria; se o CHECK recusar, usamos com categoria.
      await banco.execute(sql`
        INSERT INTO movimentacoes_bancarias (empresa_id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, origem, categoria_id)
        VALUES (${a.empresaId}, ${contaId}, '2026-02-01', 'entrada', '250.00', 'Entrada de teste', 'ajuste_manual', ${a.categoriaId}),
               (${a.empresaId}, ${contaId}, '2026-02-02', 'saida',   '50.00',  'Saida de teste',   'ajuste_manual', ${a.categoriaId})
      `);
    });

    // 100 + 250 - 50
    expect((await repositorio.buscarPorId(escopoA, contaId))?.saldoAtual.paraTexto()).toBe("300.00");
    // E a conta de B nao foi afetada por nada disso.
    expect(await repositorio.buscarPorId(escopoB, contaId)).toBeNull();

    await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE conta_bancaria_id = ${contaId}`);
    await banco.execute(sql`DELETE FROM contas_bancarias WHERE id = ${contaId}`);
  });
});
