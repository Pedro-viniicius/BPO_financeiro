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
import { RepositorioContasBancariasDrizzle } from "@/modulos/bancos/publico";
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";
import { RepositorioContasReceberDrizzle } from "@/modulos/contas-receber/publico";

import { RepositorioFluxoCaixaDrizzle } from "./repositorio-fluxo-caixa-drizzle";

/**
 * O fluxo de caixa contra PostgreSQL real.
 *
 * O teste mais importante deste arquivo e o da INVARIANTE: o saldo final do
 * ultimo periodo realizado tem de ser, ao centavo, o mesmo saldo que
 * `/bancos/[id]` mostra. Se as duas telas discordarem, o usuario nao tem como
 * saber em qual acreditar — e a resposta certa seria "em nenhuma".
 *
 * O arquivo tambem cobre o isolamento entre empresas exigido pela ADR-017.
 */
describe.skipIf(!urlBancoTeste)("fluxo de caixa (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const fluxo = new RepositorioFluxoCaixaDrizzle(banco as never);
  const bancos = new RepositorioContasBancariasDrizzle(banco as never);
  const contasPagar = new RepositorioContasPagarDrizzle(banco as never);
  const contasReceber = new RepositorioContasReceberDrizzle(banco as never);

  const HOJE = dataCivilDeTexto("2026-09-22");

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  const filtroMensal = (de: string, ate: string, contaBancariaId?: string) => ({
    de: dataCivilDeTexto(de),
    ate: dataCivilDeTexto(ate),
    granularidade: "mes" as const,
    ...(contaBancariaId ? { contaBancariaId } : {}),
  });

  async function contaPagar(valor: string, vencimento: string) {
    return contasPagar.criar(
      escopo,
      {
        descricao: `A pagar ${vencimento}`,
        fornecedorId: cenario.fornecedorId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-09-01"),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
  }

  async function contaReceber(valor: string, vencimento: string) {
    return contasReceber.criar(
      escopo,
      {
        descricao: `A receber ${vencimento}`,
        clienteId: cenario.clienteId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-09-01"),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
  }

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    usuarioId = crypto.randomUUID();
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Fluxo', ${`fx-${usuarioId}@exemplo.local`}, false, now(), now())
    `);

    // REALIZADO: uma conta paga e uma recebida, ambas no passado.
    const paga = await contaPagar("1000.00", "2026-09-05");
    await contasPagar.registrarPagamento(escopo, paga.parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto("2026-09-05"),
      valorPrincipal: Dinheiro.deTexto("1000.00"),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });

    const recebida = await contaReceber("2500.00", "2026-09-08");
    await contasReceber.registrarRecebimento(escopo, recebida.parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataRecebimento: dataCivilDeTexto("2026-09-08"),
      valorPrincipal: Dinheiro.deTexto("2500.00"),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });

    // PREVISTO: vencem depois de hoje.
    await contaPagar("300.00", "2026-10-10");
    await contaReceber("900.00", "2026-10-15");

    // EM ATRASO: venceram e ninguem baixou.
    await contaPagar("150.00", "2026-09-01");
    await contaReceber("450.00", "2026-08-20");

    // TRANSFERENCIA entre contas proprias, no passado.
    await bancos.criarTransferencia(escopo, {
      contaOrigemId: cenario.contaBancariaId,
      contaDestinoId: cenario.contaCaixaId,
      data: dataCivilDeTexto("2026-09-12"),
      valor: Dinheiro.deTexto("500.00"),
      usuarioId,
    });
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM transferencias WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM recebimentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  // ------------------------------------------------------------ invariante

  it("INVARIANTE: saldo final realizado de cada conta = saldo do extrato daquela conta", async () => {
    for (const contaId of [cenario.contaBancariaId, cenario.contaCaixaId]) {
      const resultado = await fluxo.montar(escopo, filtroMensal("2026-01-01", "2026-09-30", contaId), HOJE);
      const realizados = resultado.periodos.filter((p) => p.natureza === "realizado");
      const ultimo = realizados.at(-1)!;

      const doExtrato = (await bancos.buscarPorId(escopo, contaId))!.saldoAtual;
      expect(ultimo.saldoFinal.paraTexto(), `conta ${contaId}`).toBe(doExtrato.paraTexto());
    }
  });

  it("INVARIANTE: somando todas as contas, o fluxo bate com a soma dos extratos", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-01-01", "2026-09-30"), HOJE);
    const ultimo = resultado.periodos.filter((p) => p.natureza === "realizado").at(-1)!;

    const contas = await bancos.listar(escopo);
    const somaDosExtratos = Dinheiro.somarTodos(contas.map((c) => c.saldoAtual));

    expect(ultimo.saldoFinal.paraTexto()).toBe(somaDosExtratos.paraTexto());
    expect(resultado.saldoAtual.paraTexto()).toBe(somaDosExtratos.paraTexto());
  });

  it("o saldo encadeia: o final de um periodo e o inicial do seguinte", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-08-01", "2026-10-31"), HOJE);
    for (let i = 1; i < resultado.periodos.length; i++) {
      expect(resultado.periodos[i]!.saldoInicial.paraTexto()).toBe(resultado.periodos[i - 1]!.saldoFinal.paraTexto());
    }
  });

  // -------------------------------------------------------------- realizado

  it("realizado soma as movimentacoes efetivas do periodo", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-09-30", cenario.contaBancariaId), HOJE);
    const setembro = resultado.periodos.find((p) => p.natureza === "realizado")!;

    expect(setembro.entradas.paraTexto()).toBe("2500.00");
    expect(setembro.saidas.paraTexto()).toBe("1000.00");
  });

  it("transferencia fica em coluna propria, fora de entradas e saidas", async () => {
    const naOrigem = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-09-30", cenario.contaBancariaId), HOJE);
    const realizadoOrigem = naOrigem.periodos.find((p) => p.natureza === "realizado")!;
    expect(realizadoOrigem.transferenciasLiquidas.paraTexto()).toBe("-500.00");

    const noDestino = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-09-30", cenario.contaCaixaId), HOJE);
    const realizadoDestino = noDestino.periodos.find((p) => p.natureza === "realizado")!;
    expect(realizadoDestino.transferenciasLiquidas.paraTexto()).toBe("500.00");
    expect(realizadoDestino.entradas.paraTexto()).toBe("0.00");
    expect(realizadoDestino.saidas.paraTexto()).toBe("0.00");
  });

  it("olhando TODAS as contas, a transferencia se anula", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-09-30"), HOJE);
    const realizado = resultado.periodos.find((p) => p.natureza === "realizado")!;
    expect(realizado.transferenciasLiquidas.paraTexto()).toBe("0.00");
  });

  // --------------------------------------------------------------- previsto

  it("previsto soma as parcelas em aberto por vencimento futuro", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-10-01", "2026-10-31"), HOJE);
    const outubro = resultado.periodos.find((p) => p.natureza === "previsto")!;

    expect(outubro.entradas.paraTexto()).toBe("900.00");
    expect(outubro.saidas.paraTexto()).toBe("300.00");
  });

  it("previsto parte do saldo de hoje, nao do zero", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-10-31"), HOJE);
    const primeiroPrevisto = resultado.periodos.find((p) => p.natureza === "previsto")!;
    const ultimoRealizado = resultado.periodos.filter((p) => p.natureza === "realizado").at(-1)!;
    expect(primeiroPrevisto.saldoInicial.paraTexto()).toBe(ultimoRealizado.saldoFinal.paraTexto());
  });

  it("com UMA conta escolhida, o previsto e desligado em vez de inventado", async () => {
    // Parcela em aberto nao tem conta bancaria definida: dizer que ela cai
    // "nesta conta" seria adivinhacao.
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-10-01", "2026-10-31", cenario.contaBancariaId), HOJE);
    expect(resultado.previstoDisponivel).toBe(false);
    const outubro = resultado.periodos.find((p) => p.natureza === "previsto")!;
    expect(outubro.entradas.paraTexto()).toBe("0.00");
    expect(outubro.saidas.paraTexto()).toBe("0.00");
  });

  // -------------------------------------------------------------- em atraso

  it("o que venceu e nao foi baixado fica em linha propria, fora dos periodos", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-10-31"), HOJE);

    expect(resultado.emAtraso.aPagar.paraTexto()).toBe("150.00");
    expect(resultado.emAtraso.contagemAPagar).toBe(1);
    expect(resultado.emAtraso.aReceber.paraTexto()).toBe("450.00");
    expect(resultado.emAtraso.contagemAReceber).toBe(1);

    // E NAO entrou em nenhum periodo previsto.
    const previstos = resultado.periodos.filter((p) => p.natureza === "previsto");
    const somaPrevista = Dinheiro.somarTodos(previstos.map((p) => p.saidas));
    expect(somaPrevista.paraTexto()).toBe("300.00");
  });

  it("a lista de atrasados traz o link para a conta", async () => {
    const atrasadas = await fluxo.parcelasEmAtraso(escopo, HOJE);
    expect(atrasadas).toHaveLength(2);
    expect(atrasadas.map((p) => p.area).sort()).toEqual(["pagar", "receber"]);
    expect(atrasadas.every((p) => p.rota.startsWith("/contas-"))).toBe(true);
  });

  // ------------------------------------------------------------ abertura

  it("abertura por categoria agrupa o realizado pelo plano de contas", async () => {
    const resultado = await fluxo.montar(escopo, filtroMensal("2026-09-01", "2026-09-30"), HOJE);
    const categorias = resultado.categorias;

    expect(categorias.length).toBeGreaterThan(0);
    const transferencia = categorias.find((c) => c.categoriaNome === "Transferências entre contas");
    expect(transferencia?.entradas.paraTexto()).toBe("500.00");
    expect(transferencia?.saidas.paraTexto()).toBe("500.00");
    expect(transferencia?.grupoDre).toBeNull();
  });

  // ---------------------------------------------------------- detalhamento

  it("o detalhamento lista os lancamentos que formam o periodo", async () => {
    const filtro = filtroMensal("2026-09-01", "2026-09-30", cenario.contaBancariaId);
    const lancamentos = await fluxo.lancamentosDoPeriodo(escopo, filtro, dataCivilDeTexto("2026-09-01"), HOJE);

    expect(lancamentos.length).toBe(3); // pagamento, recebimento e a saida da transferencia
    expect(lancamentos.every((l) => l.rota.startsWith("/bancos/"))).toBe(true);
    expect(lancamentos.map((l) => l.origem).sort()).toEqual(["pagamento", "recebimento", "transferencia"]);
  });

  it("o detalhamento do previsto lista as parcelas com link para a conta", async () => {
    const parcelas = await fluxo.parcelasDoPeriodo(
      escopo,
      dataCivilDeTexto("2026-10-01"),
      dataCivilDeTexto("2026-10-31"),
      HOJE,
    );
    expect(parcelas).toHaveLength(2);
    expect(parcelas.map((p) => p.saldo.paraTexto()).sort()).toEqual(["300.00", "900.00"]);
  });


  // ------------------------------------ achados da verificacao manual

  it("o ESTORNO de uma transferencia continua sendo transferencia, nao receita", async () => {
    // Achado na verificacao manual do Gate 6: com `origem = 'estorno'`, as duas
    // pontas do estorno entravam como entrada e saida operacionais. O saldo
    // final ficava certo (elas se anulam), mas "Entradas" e "Saidas" do mes
    // apareciam infladas por dinheiro que nunca entrou nem saiu da empresa.
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      const bancosDela = new RepositorioContasBancariasDrizzle(banco as never);
      const { transferenciaId } = await bancosDela.criarTransferencia(escopoOutra, {
        contaOrigemId: outra.contaBancariaId,
        contaDestinoId: outra.contaCaixaId,
        data: dataCivilDeTexto("2026-09-10"),
        valor: Dinheiro.deTexto("400.00"),
        usuarioId,
      });
      await bancosDela.estornarTransferencia(escopoOutra, transferenciaId, {
        motivo: "Conta errada",
        dataEstorno: dataCivilDeTexto("2026-09-11"),
        usuarioId,
      });

      const resultado = await fluxo.montar(escopoOutra, filtroMensal("2026-09-01", "2026-09-30"), HOJE);
      const setembro = resultado.periodos.find((p) => p.natureza === "realizado")!;

      // Nem a transferencia nem o estorno dela contam como receita ou despesa.
      expect(setembro.entradas.paraTexto()).toBe("0.00");
      expect(setembro.saidas.paraTexto()).toBe("0.00");
      expect(setembro.transferenciasLiquidas.paraTexto()).toBe("0.00");

      // E, na abertura, os quatro lancamentos aparecem como transferencia.
      const transferencia = resultado.categorias.find((c) => c.categoriaNome === "Transferências entre contas");
      expect(transferencia?.entradas.paraTexto()).toBe("800.00");
      expect(transferencia?.saidas.paraTexto()).toBe("800.00");
    } finally {
      await banco.execute(sql`DELETE FROM transferencias WHERE empresa_id = ${outra.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${outra.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("movimentacao com data FUTURA aparece no periodo previsto, e o saldo continua batendo", async () => {
    // Segundo achado da verificacao manual: uma transferencia agendada entrava
    // no saldo da conta mas em periodo nenhum do fluxo. As duas telas passavam
    // a discordar sem nenhum aviso.
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      const bancosDela = new RepositorioContasBancariasDrizzle(banco as never);
      await bancosDela.criarTransferencia(escopoOutra, {
        contaOrigemId: outra.contaBancariaId,
        contaDestinoId: outra.contaCaixaId,
        data: dataCivilDeTexto("2026-10-02"),
        valor: Dinheiro.deTexto("250.00"),
        usuarioId,
      });

      const resultado = await fluxo.montar(escopoOutra, filtroMensal("2026-09-01", "2026-10-31"), HOJE);
      const outubro = resultado.periodos.find((p) => p.rotulo.startsWith("outubro"))!;
      expect(outubro.natureza).toBe("previsto");
      expect(outubro.quantidade).toBeGreaterThan(0);

      // Nas duas contas juntas a transferencia se anula, entao o saldo final
      // de outubro e igual ao saldo de hoje — e igual a soma dos extratos.
      const contasDela = await bancosDela.listar(escopoOutra);
      const somaDosExtratos = Dinheiro.somarTodos(contasDela.map((c) => c.saldoAtual));
      expect(outubro.saldoFinal.paraTexto()).toBe(somaDosExtratos.paraTexto());
    } finally {
      await banco.execute(sql`DELETE FROM transferencias WHERE empresa_id = ${outra.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${outra.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  // -------------------------------------------------------------- isolamento

  it("ISOLAMENTO: o fluxo de uma empresa nao enxerga o dinheiro da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };

      const resultado = await fluxo.montar(escopoOutra, filtroMensal("2026-01-01", "2026-12-31"), HOJE);
      const movimentado = resultado.periodos.reduce(
        (soma, p) => soma.somar(p.entradas).somar(p.saidas),
        Dinheiro.zero(),
      );
      expect(movimentado.paraTexto()).toBe("0.00");
      expect(resultado.emAtraso.aPagar.paraTexto()).toBe("0.00");
      expect(resultado.emAtraso.aReceber.paraTexto()).toBe("0.00");
      expect(await fluxo.parcelasEmAtraso(escopoOutra, HOJE)).toEqual([]);

      // O saldo e so o saldo inicial das contas DELA.
      const contasDela = await bancos.listar(escopoOutra);
      expect(resultado.saldoAtual.paraTexto()).toBe(Dinheiro.somarTodos(contasDela.map((c) => c.saldoAtual)).paraTexto());
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("ISOLAMENTO: escolher a conta de outra empresa nao vaza lancamento nenhum", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const filtro = filtroMensal("2026-01-01", "2026-12-31", outra.contaBancariaId);
      const resultado = await fluxo.montar(escopo, filtro, HOJE);
      const movimentado = resultado.periodos.reduce((soma, p) => soma.somar(p.entradas).somar(p.saidas), Dinheiro.zero());
      expect(movimentado.paraTexto()).toBe("0.00");

      const lancamentos = await fluxo.lancamentosDoPeriodo(
        escopo,
        filtro,
        dataCivilDeTexto("2026-01-01"),
        dataCivilDeTexto("2026-12-31"),
      );
      expect(lancamentos).toEqual([]);
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
