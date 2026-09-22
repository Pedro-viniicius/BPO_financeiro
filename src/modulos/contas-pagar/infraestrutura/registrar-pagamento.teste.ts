import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
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

import { RepositorioContasPagarDrizzle } from "./repositorio-contas-pagar-drizzle";

/**
 * O pagamento de ponta a ponta contra PostgreSQL real: saldo, situacao
 * derivada, baixa parcial, e — o mais importante — atomicidade.
 *
 * Um pagamento toca tres tabelas (movimentacao, pagamento, parcela). Se as
 * tres nao caem juntas, o sistema passa a mentir sobre dinheiro: sobraria uma
 * saida no extrato sem pagamento correspondente, ou uma parcela quitada sem
 * dinheiro ter saido.
 */
describe.skipIf(!urlBancoTeste)("registrar pagamento (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasPagarDrizzle(banco as never);
  const HOJE = dataCivilDeTexto("2026-09-22");

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  async function novaConta(valor: string, vencimento = "2026-10-05"): Promise<string> {
    const { parcelaId } = await repositorio.criar(
      escopo,
      {
        descricao: `Conta de ${valor}`,
        fornecedorId: cenario.fornecedorId,
        categoriaId: cenario.categoriaId,
        dataVencimento: dataCivilDeTexto(vencimento),
        dataCompetencia: dataCivilDeTexto("2026-10-01"),
        valor: Dinheiro.deTexto(valor),
      },
      usuarioId,
    );
    return parcelaId;
  }

  function pagamentoDe(valor: string, extras: Partial<{ juros: string; forma: string }> = {}) {
    return {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: HOJE,
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
      VALUES (${usuarioId}, 'Teste Pagamento', ${`pg-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("pagamento total zera o saldo e a conta passa a Paga", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("1000.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.valorPago.paraTexto()).toBe("1000.00");
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    expect(depois?.situacao).toBe("liquidada");
    expect(depois?.pagamentos).toHaveLength(1);
  });

  it("pagamento parcial deixa saldo e mantem a conta em aberto", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("400.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.valorPago.paraTexto()).toBe("400.00");
    expect(depois?.saldo.paraTexto()).toBe("600.00");
    expect(depois?.situacao).toBe("parcial");
  });

  it("dois pagamentos parciais somam e quitam a conta", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("400.00"));
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("600.00"));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    expect(depois?.situacao).toBe("liquidada");
    expect(depois?.pagamentos).toHaveLength(2);
  });

  it("conta quitada recusa novo pagamento", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("1000.00"));

    await expect(repositorio.registrarPagamento(escopo, conta, pagamentoDe("100.00"))).rejects.toThrow("PARCELA_NAO_ESTA_ABERTA");
  });

  it("recusa pagamento acima do saldo", async () => {
    const conta = await novaConta("1000.00");
    await expect(repositorio.registrarPagamento(escopo, conta, pagamentoDe("1000.01"))).rejects.toThrow("VALOR_ACIMA_DO_SALDO");
  });

  it("recusa valor zero ou negativo", async () => {
    const conta = await novaConta("1000.00");
    await expect(repositorio.registrarPagamento(escopo, conta, pagamentoDe("0.00"))).rejects.toThrow("VALOR_INVALIDO");
    await expect(repositorio.registrarPagamento(escopo, conta, pagamentoDe("-50.00"))).rejects.toThrow("VALOR_INVALIDO");
  });

  it("vencimento no passado sem pagamento aparece como vencida", async () => {
    const conta = await novaConta("300.00", "2026-09-01");
    const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(lida?.situacao).toBe("vencida");
  });

  it("juros entram na saida do banco, mas nao abatem o saldo alem do principal", async () => {
    const conta = await novaConta("1000.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("1000.00", { juros: "50.00" }));

    const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(depois?.saldo.paraTexto()).toBe("0.00");
    // O que saiu da conta bancaria e principal + juros.
    expect(depois?.pagamentos[0]?.valorPago.paraTexto()).toBe("1050.00");
    expect(depois?.pagamentos[0]?.valorPrincipal.paraTexto()).toBe("1000.00");
  });

  it("o pagamento gera UMA movimentacao bancaria de saida", async () => {
    const conta = await novaConta("250.00");
    const antes = await contarMovimentacoes();
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("250.00"));
    expect(await contarMovimentacoes()).toBe(antes + 1);

    const [mov] = await banco.execute<{ tipo: string; valor: string; origem: string }>(sql`
      SELECT m.tipo, m.valor, m.origem
      FROM movimentacoes_bancarias m
      JOIN pagamentos p ON p.movimentacao_bancaria_id = m.id
      WHERE p.parcela_pagar_id = ${conta}
    `);
    expect(mov?.tipo).toBe("saida");
    expect(mov?.valor).toBe("250.00");
    expect(mov?.origem).toBe("pagamento");
  });

  it("ATOMICIDADE: se o pagamento falha, a movimentacao bancaria nao sobra", async () => {
    const conta = await novaConta("500.00");
    const antes = await contarMovimentacoes();

    // A movimentacao e gravada ANTES do pagamento. Uma forma de pagamento
    // invalida derruba o INSERT seguinte — se a transacao nao fosse unica, a
    // saida de dinheiro ficaria no extrato sem pagamento nenhum por tras.
    await expect(repositorio.registrarPagamento(escopo, conta, pagamentoDe("500.00", { forma: "nao_existe" }))).rejects.toThrow();

    expect(await contarMovimentacoes()).toBe(antes);

    const intacta = await repositorio.buscarPorId(escopo, conta, HOJE);
    expect(intacta?.valorPago.paraTexto()).toBe("0.00");
    expect(intacta?.situacao).toBe("aberta");
    expect(intacta?.pagamentos).toHaveLength(0);
  });

  it("o pagamento fica na trilha de auditoria", async () => {
    const conta = await novaConta("120.00");
    await repositorio.registrarPagamento(escopo, conta, pagamentoDe("120.00"));

    const linhas = await banco.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM eventos_auditoria
      WHERE empresa_id = ${cenario.empresaId} AND acao = 'conta_pagar.paga' AND entidade_id = ${conta}
    `);
    expect(Number(linhas[0]?.total)).toBe(1);
  });
});
