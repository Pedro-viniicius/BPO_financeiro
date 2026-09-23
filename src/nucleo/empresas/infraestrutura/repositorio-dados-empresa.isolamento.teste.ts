import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { validarCnpj } from "@/compartilhado/validacao/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import type { DadosDaEmpresa } from "../aplicacao/dados-da-empresa";
import { RepositorioDadosDaEmpresaDrizzle } from "./repositorio-dados-empresa-drizzle";

/**
 * Dados da empresa contra PostgreSQL real, incluindo o ISOLAMENTO entre
 * empresas: salvar uma nunca pode alterar a outra.
 */
describe.skipIf(!urlBancoTeste)("dados da empresa (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioDadosDaEmpresaDrizzle(banco as never);
  let a: CenarioBase, b: CenarioBase;
  let escopoA: EscopoEmpresa, escopoB: EscopoEmpresa;
  let usuarioId = "";

  const escopoDe = (c: CenarioBase): EscopoEmpresa => ({
    organizacaoId: comoIdentificador<"Organizacao">(c.organizacaoId),
    empresaId: comoIdentificador<"Empresa">(c.empresaId),
  });

  const base = (extras: Partial<DadosDaEmpresa> = {}): DadosDaEmpresa => ({
    razaoSocial: "Nova Didata Educação Profissional Ltda",
    nomeFantasia: "Nova Didata",
    cnpj: null,
    email: "financeiro@exemplo.local",
    telefone: "(35) 3531-0000",
    cep: "37950000",
    logradouro: "Rua das Escolas",
    numero: "120",
    complemento: null,
    bairro: "Centro",
    municipio: "São Sebastião do Paraíso",
    uf: "MG",
    dataInicioUso: dataCivilDeTexto("2026-01-01"),
    fusoHorario: "America/Sao_Paulo",
    ...extras,
  });

  beforeAll(async () => {
    a = await criarCenarioBase(banco as BancoTeste);
    b = await criarCenarioBase(banco as BancoTeste);
    escopoA = escopoDe(a);
    escopoB = escopoDe(b);
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    usuarioId = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Empresa', ${`empresa-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    for (const c of [a, b]) {
      if (!c) continue;
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${c.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, c);
    }
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("grava e le todos os campos, inclusive a data de corte", async () => {
    await repositorio.salvar(escopoA, base(), usuarioId);
    const lido = await repositorio.obter(escopoA);

    expect(lido?.razaoSocial).toBe("Nova Didata Educação Profissional Ltda");
    expect(lido?.municipio).toBe("São Sebastião do Paraíso");
    expect(lido?.uf).toBe("MG");
    expect(lido?.dataInicioUso).toBe("2026-01-01");
  });

  it("texto em branco vira NULO: vazio e ausencia, nao valor", async () => {
    await repositorio.salvar(escopoA, base({ complemento: "   ", telefone: "" }), usuarioId);
    const lido = await repositorio.obter(escopoA);

    expect(lido?.complemento).toBeNull();
    expect(lido?.telefone).toBeNull();
  });

  it("a UF e guardada em maiuscula, como o CHECK do banco exige", async () => {
    await repositorio.salvar(escopoA, base({ uf: "mg" }), usuarioId);
    expect((await repositorio.obter(escopoA))?.uf).toBe("MG");
  });

  it("o banco recusa CEP e UF fora do formato", async () => {
    await expect(
      banco.execute(sql`UPDATE empresas SET cep = '123' WHERE id = ${a.empresaId}`),
    ).rejects.toThrow();
    await expect(
      banco.execute(sql`UPDATE empresas SET uf = 'Minas' WHERE id = ${a.empresaId}`),
    ).rejects.toThrow();
  });

  it("o CNPJ so entra se os digitos verificadores fecharem", () => {
    // A validacao mora em `compartilhado/validacao` e ja era usada no primeiro
    // acesso; aqui se confirma que e a MESMA regra, e nao uma segunda copia.
    expect(validarCnpj("11222333000181")).toBe(true);
    expect(validarCnpj("11222333000182")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });

  it("o CNPJ e unico no sistema: duas empresas nao podem ter o mesmo", async () => {
    await repositorio.salvar(escopoA, base({ cnpj: "11222333000181" }), usuarioId);
    await expect(repositorio.salvar(escopoB, base({ cnpj: "11222333000181" }), usuarioId)).rejects.toThrow();
  });

  it("salvar uma empresa nao toca na outra", async () => {
    await repositorio.salvar(escopoB, base({ razaoSocial: "Outra Empresa Ltda", cnpj: null, nomeFantasia: "Outra" }), usuarioId);

    expect((await repositorio.obter(escopoA))?.razaoSocial).toBe("Nova Didata Educação Profissional Ltda");
    expect((await repositorio.obter(escopoB))?.razaoSocial).toBe("Outra Empresa Ltda");
  });

  it("toda alteracao registra o ANTES e o DEPOIS na auditoria", async () => {
    await repositorio.salvar(escopoA, base({ nomeFantasia: "Didata" }), usuarioId);

    const [evento] = await banco.execute<{ acao: string; antes: unknown; depois: unknown }>(sql`
      SELECT acao, dados_antes AS antes, dados_depois AS depois
      FROM eventos_auditoria
      WHERE empresa_id = ${a.empresaId} AND acao = 'empresa.dados_atualizados'
      ORDER BY ocorrido_em DESC LIMIT 1
    `);

    expect(evento?.acao).toBe("empresa.dados_atualizados");
    expect(evento?.antes).toBeTruthy();
    expect(JSON.stringify(evento?.depois)).toContain("Didata");
  });
});
