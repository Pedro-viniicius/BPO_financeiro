import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { RepositorioCadastrosDrizzle } from "./repositorio-cadastros-drizzle";

/**
 * Isolamento de cadastros — controle 3 da ADR-017.
 *
 * Aqui o isolamento tem DOIS niveis, e o teste cobre os dois: papeis (cliente,
 * fornecedor) sao por EMPRESA; pessoas sao por ORGANIZACAO, porque a identidade
 * e compartilhada dentro do grupo economico (ADR-005). Duas organizacoes
 * diferentes nunca se enxergam.
 */
describe.skipIf(!urlBancoTeste)("isolamento de cadastros (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioCadastrosDrizzle(banco as never);
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

  it("pessoas de outra organizacao nao aparecem", async () => {
    const { pessoaId } = await repositorio.criarPessoa(escopoA, {
      nome: "Papelaria Central LTDA",
      tipo: "juridica",
      ehCliente: false,
      ehFornecedor: true,
    });

    expect((await repositorio.listarPessoas(escopoA)).map((p) => p.pessoaId)).toContain(pessoaId);
    expect((await repositorio.listarPessoas(escopoB)).map((p) => p.pessoaId)).not.toContain(pessoaId);
  });

  it("fornecedores e clientes de outra empresa nao aparecem", async () => {
    const fornecedoresA = await repositorio.listarFornecedores(escopoA);
    const fornecedoresB = await repositorio.listarFornecedores(escopoB);
    expect(fornecedoresA.map((f) => f.id)).toContain(a.fornecedorId);
    expect(fornecedoresA.map((f) => f.id)).not.toContain(b.fornecedorId);
    expect(fornecedoresB.map((f) => f.id)).not.toContain(a.fornecedorId);

    const clientesA = await repositorio.listarClientes(escopoA);
    expect(clientesA.map((c) => c.id)).toContain(a.clienteId);
    expect(clientesA.map((c) => c.id)).not.toContain(b.clienteId);
  });

  it("categorias e plano de contas sao por empresa", async () => {
    const categoriasA = await repositorio.listarCategorias(escopoA);
    expect(categoriasA.map((c) => c.id)).toContain(a.categoriaId);
    expect(categoriasA.map((c) => c.id)).not.toContain(b.categoriaId);

    const planoA = await repositorio.listarContasPlano(escopoA);
    expect(planoA.map((c) => c.id)).toContain(a.contaPlanoId);
    expect(planoA.map((c) => c.id)).not.toContain(b.contaPlanoId);
  });

  it("a mesma pessoa pode ser cliente E fornecedor sem cadastro duplicado", async () => {
    const { pessoaId } = await repositorio.criarPessoa(escopoA, {
      nome: "Grafica que compra e vende",
      tipo: "juridica",
      ehCliente: true,
      ehFornecedor: true,
    });

    const pessoa = (await repositorio.listarPessoas(escopoA)).find((p) => p.pessoaId === pessoaId);
    expect(pessoa?.ehCliente).toBe(true);
    expect(pessoa?.ehFornecedor).toBe(true);
    // Uma pessoa so, dois papeis — nao duas pessoas.
    const [contagem] = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM pessoas WHERE id = ${pessoaId}`,
    );
    expect(Number(contagem?.total)).toBe(1);
  });

  it("a busca por nome respeita a organizacao", async () => {
    await repositorio.criarPessoa(escopoA, { nome: "Alvo Exclusivo de A", tipo: "juridica", ehCliente: true, ehFornecedor: false });
    expect(await repositorio.listarPessoas(escopoB, "Alvo Exclusivo")).toEqual([]);
    expect((await repositorio.listarPessoas(escopoA, "Alvo Exclusivo")).length).toBe(1);
  });
});
