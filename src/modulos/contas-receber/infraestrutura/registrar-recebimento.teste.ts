import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
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
 * O recebimento de ponta a ponta contra PostgreSQL real: saldo, situacao
 * derivada, baixa parcial, e — o mais importante — atomicidade.
 *
 * Um recebimento toca tres tabelas (movimentacao, recebimento, parcela). Se as
 * tres nao caem juntas, o sistema passa a mentir sobre dinheiro: sobraria uma
 * saida no extrato sem recebimento correspondente, ou uma parcela quitada sem
 * dinheiro ter saido.
 */
describe.skipIf(!urlBancoTeste)("registrar recebimento (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasReceberDrizzle(banco as never);
  const HOJE = dataCivilDeTexto("2026-09-22");

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  async function novaConta(valor: string, vencimento = "2026-10-05"): Promise<string> {
    const { parcelaId } = await repositorio.criar(
      escopo,
      {
        descricao: `Conta de ${valor}`,
        clienteId: cenario.clienteId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-10-01"),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
    return parcelaId;
  }

  function recebimentoDe(valor: string, extras: Partial<{ juros: string; forma: string }> = {}) {
    return {
      contaBancariaId: cenario.contaBancariaId,
      dataRecebimento: HOJE,
      valorPrincipal: Dinheiro.deTexto(valor),
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: extras.forma ?? "pix",
      usuarioId,
    };
  }

  const contarMovimentacoes = async (): Promise<number> => {
    const linhas = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM movimentacoes_bancarias WHERE empresa_id = ${cenario.empresaId}`,
    );
    return Number(linhas[0]?.total ?? 0);
  };

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    usuarioId = crypto.randomUUID();
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Recebimento', ${`pg-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM recebimentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_receber WHERE empresa_id = ${cenario.empresaId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("recebimento total zera o saldo e a conta passa a Paga", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("1000.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.valorRecebido.paraTexto()).toBe("1000.00");
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    expect(depois?.situacao).toBe("liquidada");
    expect(depois?.recebimentos).toHaveLength(1);
  });

  it("recebimento parcial deixa saldo e mantem a conta em aberto", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("400.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.valorRecebido.paraTexto()).toBe("400.00");
    expect(depois?.saldo.paraTexto()).toBe("600.00");
    expect(depois?.situacao).toBe("parcial");
  });

  it("dois recebimentos parciais somam e quitam a conta", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("400.00"));
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("600.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    expect(depois?.situacao).toBe("liquidada");
    expect(depois?.recebimentos).toHaveLength(2);
  });

  it("conta quitada recusa novo recebimento", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("1000.00"));

    await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("100.00"))).rejects.toThrow("PARCELA_NAO_ESTA_ABERTA");
  });

  it("recusa recebimento acima do saldo", async () => {
    const conta = await novaConta("1000.00");
    await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("1000.01"))).rejects.toThrow("VALOR_ACIMA_DO_SALDO");
  });

  it("recusa valor zero ou negativo", async () => {
    const conta = await novaConta("1000.00");
    await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("0.00"))).rejects.toThrow("VALOR_INVALIDO");
    await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("-50.00"))).rejects.toThrow("VALOR_INVALIDO");
  });

  it("vencimento no passado sem recebimento aparece como vencida", async () => {
    const conta = await novaConta("300.00", "2026-09-01");
    const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(lida?.situacao).toBe("vencida");
  });

  it("juros entram na entrada do banco, mas nao abatem o saldo alem do principal", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("1000.00", { juros: "50.00" }));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    // O que entrou na conta bancaria e principal + juros.
    expect(depois?.recebimentos[0]?.valorRecebido.paraTexto()).toBe("1050.00");
    expect(depois?.recebimentos[0]?.valorPrincipal.paraTexto()).toBe("1000.00");
  });

  it("o recebimento gera UMA movimentacao bancaria de entrada", async () => {
    const conta = await novaConta("250.00");
    const antes = await contarMovimentacoes();
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("250.00"));
    expect(await contarMovimentacoes()).toBe(antes + 1);

    const [mov] = await banco.execute<{ tipo: string; valor: string; origem: string }>(sql`
      SELECT m.tipo, m.valor, m.origem
      FROM movimentacoes_bancarias m
      JOIN recebimentos p ON p.movimentacao_bancaria_id = m.id
      WHERE p.parcela_receber_id = ${conta}
    `);
    expect(mov?.tipo).toBe("entrada");
    expect(mov?.valor).toBe("250.00");
    expect(mov?.origem).toBe("recebimento");
  });

  it("ATOMICIDADE: se o recebimento falha, a movimentacao bancaria nao sobra", async () => {
    const conta = await novaConta("500.00");
    const antes = await contarMovimentacoes();

    // A movimentacao e gravada ANTES do recebimento. Uma forma de recebimento
    // invalida derruba o INSERT seguinte — se a transacao nao fosse unica, a
    // saida de dinheiro ficaria no extrato sem recebimento nenhum por tras.
    await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("500.00", { forma: "nao_existe" }))).rejects.toThrow();

    expect(await contarMovimentacoes()).toBe(antes);

    const intacta = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(intacta?.valorRecebido.paraTexto()).toBe("0.00");
    expect(intacta?.situacao).toBe("aberta");
    expect(intacta?.recebimentos).toHaveLength(0);
  });

  it("o recebimento fica na trilha de auditoria", async () => {
    const conta = await novaConta("120.00");
    await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("120.00"));

    const linhas = await banco.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM eventos_auditoria
      WHERE empresa_id = ${cenario.empresaId} AND acao = 'conta_receber.paga' AND entidade_id = ${conta}
    `);
    expect(Number(linhas[0]?.total)).toBe(1);
  });
});
