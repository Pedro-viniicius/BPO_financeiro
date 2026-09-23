import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { PLANO_PADRAO } from "../aplicacao/plano-padrao";
import { RepositorioCadastrosDrizzle } from "./repositorio-cadastros-drizzle";

/**
 * A semente do plano padrao contra PostgreSQL real.
 *
 * O que importa aqui e que apertar o botao duas vezes nao estrague nada. Um
 * plano de contas duplicado nao e so feio: `categorias_financeiras` tem indice
 * unico por (empresa, nome), entao a segunda tentativa falharia no meio e
 * deixaria o plano pela metade — com parte das contas criadas e parte nao.
 */
describe.skipIf(!urlBancoTeste)("semente do plano de contas (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioCadastrosDrizzle(banco as never);
  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;

  const contarContas = async () => {
    const [linha] = await banco.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM contas_plano WHERE empresa_id = ${cenario.empresaId}`,
    );
    return Number(linha!.n);
  };
  const contarCategorias = async () => {
    const [linha] = await banco.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}`,
    );
    return Number(linha!.n);
  };

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    // O cenario base ja traz plano e categorias proprios: a semente precisa
    // conviver com eles, que e exatamente o caso real.
    await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${cenario.empresaId}`);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${cenario.empresaId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await cliente.end();
  });

  it("a previa diz o que sera criado ANTES de gravar", async () => {
    const previa = await repositorio.previaDoPlanoPadrao(escopo);
    expect(previa.contas).toHaveLength(PLANO_PADRAO.length);
    expect(previa.categorias).toHaveLength(PLANO_PADRAO.flatMap((c) => c.categorias).length);
    // Previa nao grava.
    expect(await contarContas()).toBe(0);
  });

  it("a primeira semeadura cria o plano inteiro", async () => {
    const resultado = await repositorio.semearPlanoPadrao(escopo);

    expect(resultado.contasCriadas).toBe(PLANO_PADRAO.length);
    expect(resultado.categoriasCriadas).toBe(PLANO_PADRAO.flatMap((c) => c.categorias).length);
    expect(await contarContas()).toBe(PLANO_PADRAO.length);
  });

  it("IDEMPOTENTE: a segunda semeadura nao cria nada nem duplica", async () => {
    const contasAntes = await contarContas();
    const categoriasAntes = await contarCategorias();

    const resultado = await repositorio.semearPlanoPadrao(escopo);

    expect(resultado).toEqual({ contasCriadas: 0, categoriasCriadas: 0 });
    expect(await contarContas()).toBe(contasAntes);
    expect(await contarCategorias()).toBe(categoriasAntes);

    // E a previa, coerente com isso, nao oferece mais nada.
    const previa = await repositorio.previaDoPlanoPadrao(escopo);
    expect(previa.contas).toEqual([]);
    expect(previa.categorias).toEqual([]);
  });

  it("completa o que falta sem tocar no que o cliente ja ajustou", async () => {
    // O cliente apaga uma conta e renomeia outra, como faria na tela.
    await banco.execute(sql`
      DELETE FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}
        AND conta_plano_id IN (SELECT id FROM contas_plano WHERE empresa_id = ${cenario.empresaId} AND codigo = '4.0.01')
    `);
    await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${cenario.empresaId} AND codigo = '4.0.01'`);
    await banco.execute(sql`
      UPDATE contas_plano SET nome = 'Ocupação da escola'
      WHERE empresa_id = ${cenario.empresaId} AND codigo = '4.1.02'
    `);

    const resultado = await repositorio.semearPlanoPadrao(escopo);

    expect(resultado.contasCriadas).toBe(1);
    expect(resultado.categoriasCriadas).toBe(2);

    // O nome ajustado pelo cliente CONTINUA como ele deixou.
    const [conta] = await banco.execute<{ nome: string }>(sql`
      SELECT nome FROM contas_plano WHERE empresa_id = ${cenario.empresaId} AND codigo = '4.1.02'
    `);
    expect(conta!.nome).toBe("Ocupação da escola");
  });

  it("uma empresa nao enxerga nem semeia o plano da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra: EscopoEmpresa = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      const antes = await contarContas();
      await repositorio.semearPlanoPadrao(escopoOutra);
      expect(await contarContas()).toBe(antes);
    } finally {
      await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${outra.empresaId}`);
      await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${outra.empresaId}`);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
