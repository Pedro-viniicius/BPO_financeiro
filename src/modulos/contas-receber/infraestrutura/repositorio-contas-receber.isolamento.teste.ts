import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import {
  apagarCenarioBase,
  criarBancoTeste,
  criarCenarioBase,
  urlBancoTeste,
  type BancoTeste,
  type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { RepositorioContasReceberDrizzle } from "./repositorio-contas-receber-drizzle";

/**
 * Isolamento entre empresas em contas a pagar — a contrapartida de nao usar
 * seguranca por linha (ADR-017).
 *
 * O teste nao se contenta em "A ve as contas de A". Ele entrega a A o UUID
 * exato do registro de B e exige que A continue sem enxergar nada: e assim que
 * um vazamento aconteceria de verdade, com um id vindo de um link, um relatorio
 * antigo ou a barra de enderecos.
 */
describe.skipIf(!urlBancoTeste)("isolamento entre empresas em contas a pagar (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasReceberDrizzle(banco as never);
  const HOJE = dataCivilDeTexto("2026-09-22");
  const PAGINACAO = { pagina: 1, tamanho: 50 };

  let a: CenarioBase;
  let b: CenarioBase;
  let escopoA: EscopoEmpresa;
  let escopoB: EscopoEmpresa;
  let contaDeA = "";
  let contaDeB = "";
  let usuarioId = "";

  /** `titulos_receber.criado_por_usuario_id` aponta para `user`: precisa existir. */
  async function criarUsuario(): Promise<string> {
    const id = crypto.randomUUID();
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${id}, 'Teste Isolamento', ${`teste-${id}@exemplo.local`}, false, now(), now())
    `);
    return id;
  }

  const escopoDe = (c: CenarioBase): EscopoEmpresa => ({
    organizacaoId: comoIdentificador<"Organizacao">(c.organizacaoId),
    empresaId: comoIdentificador<"Empresa">(c.empresaId),
  });

  beforeAll(async () => {
    a = await criarCenarioBase(banco as BancoTeste);
    b = await criarCenarioBase(banco as BancoTeste);
    escopoA = escopoDe(a);
    escopoB = escopoDe(b);
    usuarioId = await criarUsuario();

    contaDeA = (
      await repositorio.criar(
        escopoA,
        {
          descricao: "Aluguel da sala",
          clienteId: a.clienteId,
          categoriaId: a.categoriaId,
          dataCompetencia: dataCivilDeTexto("2026-10-01"),
          valorTotal: Dinheiro.deTexto("1000.00"),
          parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto("2026-10-05") as DataVencimento, valor: Dinheiro.deTexto("1000.00") }],
        },
        usuarioId,
      )
    ).parcelaId;

    contaDeB = (
      await repositorio.criar(
        escopoB,
        {
          descricao: "Energia eletrica",
          clienteId: b.clienteId,
          categoriaId: b.categoriaId,
          dataCompetencia: dataCivilDeTexto("2026-10-01"),
          valorTotal: Dinheiro.deTexto("500.00"),
          parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto("2026-10-08") as DataVencimento, valor: Dinheiro.deTexto("500.00") }],
        },
        usuarioId,
      )
    ).parcelaId;
  });

  afterAll(async () => {
    for (const cenario of [a, b]) {
      if (!cenario) continue;
      await banco.execute(sql`DELETE FROM recebimentos WHERE empresa_id = ${cenario.empresaId}`);
      await banco.execute(sql`DELETE FROM parcelas_receber WHERE empresa_id = ${cenario.empresaId}`);
      await banco.execute(sql`DELETE FROM titulos_receber WHERE empresa_id = ${cenario.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, cenario);
    }
    if (usuarioId) await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("cada empresa lista apenas as proprias contas", async () => {
    const listaA = await repositorio.listar(escopoA, {}, PAGINACAO, HOJE);
    const listaB = await repositorio.listar(escopoB, {}, PAGINACAO, HOJE);

    expect(listaA.itens.map((i) => i.parcelaId)).toEqual([contaDeA]);
    expect(listaB.itens.map((i) => i.parcelaId)).toEqual([contaDeB]);
    expect(listaA.itens.map((i) => i.descricao)).not.toContain("Energia eletrica");
    expect(listaB.itens.map((i) => i.descricao)).not.toContain("Aluguel da sala");
  });

  it("A nao abre a conta de B mesmo sabendo o UUID — e vice-versa", async () => {
    expect(await repositorio.buscarPorId(escopoA, contaDeB, HOJE)).toBeNull();
    expect(await repositorio.buscarPorId(escopoB, contaDeA, HOJE)).toBeNull();

    // E cada uma continua abrindo a propria, para o teste nao passar por engano.
    expect((await repositorio.buscarPorId(escopoA, contaDeA, HOJE))?.descricao).toBe("Aluguel da sala");
    expect((await repositorio.buscarPorId(escopoB, contaDeB, HOJE))?.descricao).toBe("Energia eletrica");
  });

  it("A nao edita a conta de B mesmo sabendo o UUID", async () => {
    // Recusa com o MESMO erro de um id inexistente: a resposta nao revela que
    // o registro existe em outra empresa.
    await expect(
      repositorio.editar(
        escopoA,
        contaDeB,
        {
          descricao: "INVADIDO",
          categoriaId: a.categoriaId,
          clienteId: a.clienteId,
          dataVencimento: dataCivilDeTexto("2030-01-01") as DataVencimento,
          valor: Dinheiro.deTexto("1.00"),
        },
        usuarioId,
      ),
    ).rejects.toThrow("PARCELA_NAO_ENCONTRADA");

    const intacta = await repositorio.buscarPorId(escopoB, contaDeB, HOJE);
    expect(intacta?.descricao).toBe("Energia eletrica");
    expect(intacta?.valorOriginal.paraTexto()).toBe("500.00");
  });

  it("A nao paga a conta de B mesmo sabendo o UUID", async () => {
    await expect(
      repositorio.registrarRecebimento(escopoA, contaDeB, {
        contaBancariaId: a.contaBancariaId,
        dataRecebimento: HOJE,
        valorPrincipal: Dinheiro.deTexto("500.00"),
        valorJuros: Dinheiro.zero(),
        valorMulta: Dinheiro.zero(),
        valorDesconto: Dinheiro.zero(),
        formaPagamento: "pix",
        usuarioId,
      }),
    ).rejects.toThrow("PARCELA_NAO_ENCONTRADA");

    const intacta = await repositorio.buscarPorId(escopoB, contaDeB, HOJE);
    expect(intacta?.valorRecebido.paraTexto()).toBe("0.00");
  });

  it("nao da para pagar uma conta propria com a conta bancaria de outra empresa", async () => {
    await expect(
      repositorio.registrarRecebimento(escopoA, contaDeA, {
        contaBancariaId: b.contaBancariaId,
        dataRecebimento: HOJE,
        valorPrincipal: Dinheiro.deTexto("10.00"),
        valorJuros: Dinheiro.zero(),
        valorMulta: Dinheiro.zero(),
        valorDesconto: Dinheiro.zero(),
        formaPagamento: "pix",
        usuarioId,
      }),
    ).rejects.toThrow("CONTA_BANCARIA_NAO_ENCONTRADA");
  });

  it("a busca por texto tambem respeita o escopo", async () => {
    const achouEmA = await repositorio.listar(escopoA, { busca: "Energia" }, PAGINACAO, HOJE);
    expect(achouEmA.itens).toEqual([]);
  });
});
