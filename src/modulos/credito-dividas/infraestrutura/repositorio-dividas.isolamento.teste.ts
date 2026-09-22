import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarDataCivil, dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
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
import { RepositorioDreDrizzle } from "@/modulos/dre/publico";

import { gerarCronograma } from "@/compartilhado/financeiro/indice";
import { RepositorioDividasDrizzle } from "./repositorio-dividas-drizzle";

/**
 * Dividas contra PostgreSQL real.
 *
 * O contrato do cenario e sempre o mesmo emprestimo da tabela de referencia:
 * R$ 12.000,00, 2% a.m., 12 parcelas, Price. Parcela 1 = R$ 1.134,72, sendo
 * R$ 240,00 de juros e R$ 894,72 de amortizacao.
 *
 * O que estes testes protegem: uma parcela de emprestimo NAO e despesa
 * inteira. Somar os R$ 1.134,72 no resultado mostraria um prejuizo que nao
 * existe — R$ 894,72 apenas trocam de lugar.
 */
describe.skipIf(!urlBancoTeste)("dividas (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const dividas = new RepositorioDividasDrizzle(banco as never);
  const contasPagar = new RepositorioContasPagarDrizzle(banco as never);
  const bancos = new RepositorioContasBancariasDrizzle(banco as never);
  const dre = new RepositorioDreDrizzle(banco as never);

  const HOJE = dataCivilDeTexto("2026-12-20");

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";
  let categoriaJuros = "";

  const CRONOGRAMA = gerarCronograma({
    valorPrincipal: Dinheiro.deTexto("12000.00"),
    taxaMensal: 2,
    quantidadeParcelas: 12,
    primeiroVencimento: dataCivilDeTexto("2026-10-10") as DataVencimento,
    sistema: "price",
  });

  const dadosBase = () => ({
    credorPessoaId: cenario.pessoaFornecedorId,
    tipo: "emprestimo" as const,
    descricao: "Capital de giro",
    numeroContrato: "CT-9911",
    dataContratacao: dataCivilDeTexto("2026-09-25"),
    valorPrincipal: Dinheiro.deTexto("12000.00"),
    taxaMensal: 2,
    sistema: "price" as const,
    categoriaJurosId: categoriaJuros,
    usuarioId,
  });

  async function criarEmprestimo(extras: Record<string, unknown> = {}) {
    return dividas.criar(escopo, { ...dadosBase(), ...extras }, CRONOGRAMA);
  }

  async function pagarParcela(dividaId: string, numero: number, data: string, extras: Partial<{ juros: string }> = {}) {
    const detalhe = await dividas.buscarPorId(escopo, dividaId, HOJE);
    const parcela = detalhe!.parcelas.find((p) => p.numeroParcela === numero)!;
    return contasPagar.registrarPagamento(escopo, parcela.parcelaPagarId!, {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto(data),
      valorPrincipal: parcela.valorTotal,
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });
  }

  /**
   * Roda o teste numa empresa PROPRIA.
   *
   * Os testes deste arquivo compartilham uma empresa, e o demonstrativo soma
   * tudo o que ela tem — entao qualquer asserção sobre total do DRE precisa de
   * um cenario isolado, senao um teste enxerga os emprestimos dos outros.
   */
  async function comEmpresaPropria(
    corpo: (contexto: { escopo: EscopoEmpresa; cenario: CenarioBase; categoriaJurosId: string }) => Promise<void>,
  ): Promise<void> {
    const proprio = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoProprio = {
        organizacaoId: comoIdentificador<"Organizacao">(proprio.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(proprio.empresaId),
      };
      const [conta] = await banco.execute<{ id: string }>(sql`
        INSERT INTO contas_plano (empresa_id, codigo, nome, grupo_dre)
        VALUES (${proprio.empresaId}, '4.7.01', 'Financeiras', 'resultado_financeiro') RETURNING id::text AS id
      `);
      const [categoria] = await banco.execute<{ id: string }>(sql`
        INSERT INTO categorias_financeiras (empresa_id, nome, conta_plano_id)
        VALUES (${proprio.empresaId}, 'Juros', ${conta!.id}) RETURNING id::text AS id
      `);
      await corpo({ escopo: escopoProprio, cenario: proprio, categoriaJurosId: categoria!.id });
    } finally {
      await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${proprio.empresaId}`);
      await banco.execute(sql`DELETE FROM parcelas_divida WHERE empresa_id = ${proprio.empresaId}`);
      await banco.execute(sql`DELETE FROM dividas WHERE empresa_id = ${proprio.empresaId}`);
      await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${proprio.empresaId}`);
      await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${proprio.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${proprio.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, proprio);
    }
  }

  /** Cria o emprestimo de referencia numa empresa qualquer. */
  async function emprestimoEm(contexto: { escopo: EscopoEmpresa; cenario: CenarioBase; categoriaJurosId: string }) {
    return dividas.criar(
      contexto.escopo,
      {
        ...dadosBase(),
        credorPessoaId: contexto.cenario.pessoaFornecedorId,
        categoriaJurosId: contexto.categoriaJurosId,
      },
      CRONOGRAMA,
    );
  }

  /** Paga a parcela `numero` de uma divida, pela conta a pagar. */
  async function pagarEm(
    contexto: { escopo: EscopoEmpresa; cenario: CenarioBase },
    dividaId: string,
    numero: number,
    data: string,
    extras: Partial<{ juros: string }> = {},
  ) {
    const detalhe = await dividas.buscarPorId(contexto.escopo, dividaId, HOJE);
    const parcela = detalhe!.parcelas.find((p) => p.numeroParcela === numero)!;
    return contasPagar.registrarPagamento(contexto.escopo, parcela.parcelaPagarId!, {
      contaBancariaId: contexto.cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto(data),
      valorPrincipal: parcela.valorTotal,
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });
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
      VALUES (${usuarioId}, 'Teste Dividas', ${`dv-${usuarioId}@exemplo.local`}, false, now(), now())
    `);

    const [conta] = await banco.execute<{ id: string }>(sql`
      INSERT INTO contas_plano (empresa_id, codigo, nome, grupo_dre)
      VALUES (${cenario.empresaId}, '4.7.01', 'Financeiras divida', 'resultado_financeiro')
      RETURNING id::text AS id
    `);
    const [categoria] = await banco.execute<{ id: string }>(sql`
      INSERT INTO categorias_financeiras (empresa_id, nome, conta_plano_id)
      VALUES (${cenario.empresaId}, 'Juros de emprestimo', ${conta!.id})
      RETURNING id::text AS id
    `);
    categoriaJuros = categoria!.id;
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_divida WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM dividas WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  // ------------------------------------------- integracao com contas a pagar

  it("cada parcela vira uma parcela de CONTA A PAGAR, vinculada", async () => {
    const { dividaId, tituloPagarId } = await criarEmprestimo();

    const [contagem] = await banco.execute<{ parcelas: number; vinculadas: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM parcelas_pagar WHERE titulo_pagar_id = ${tituloPagarId}) AS parcelas,
        (SELECT count(*)::int FROM parcelas_divida WHERE divida_id = ${dividaId} AND parcela_pagar_id IS NOT NULL) AS vinculadas
    `);
    expect(Number(contagem?.parcelas)).toBe(12);
    expect(Number(contagem?.vinculadas)).toBe(12);
  });

  it("a parcela de conta a pagar vale o TOTAL: amortizacao mais juros", async () => {
    const { dividaId } = await criarEmprestimo();
    const detalhe = await dividas.buscarPorId(escopo, dividaId, HOJE);
    const primeira = detalhe!.parcelas[0]!;

    expect(primeira.valorAmortizacao.paraTexto()).toBe("894.72");
    expect(primeira.valorJuros.paraTexto()).toBe("240.00");
    expect(primeira.valorTotal.paraTexto()).toBe("1134.72");

    const [conta] = await banco.execute<{ valor: string }>(
      sql`SELECT valor_original::text AS valor FROM parcelas_pagar WHERE id = ${primeira.parcelaPagarId}`,
    );
    // O compromisso real e 1.134,72: e isso que a lista e a previsao mostram.
    expect(conta?.valor).toBe("1134.72");
  });

  it("a soma das amortizacoes bate com o valor contratado", async () => {
    const { dividaId } = await criarEmprestimo();
    const detalhe = await dividas.buscarPorId(escopo, dividaId, HOJE);
    const soma = Dinheiro.somarTodos(detalhe!.parcelas.map((p) => p.valorAmortizacao));
    expect(soma.paraTexto()).toBe("12000.00");
    expect(detalhe!.parcelas.at(-1)?.saldoDevedor.ehZero()).toBe(true);
  });

  it("ATOMICIDADE: falha no meio nao deixa divida sem parcelas nem conta a pagar orfa", async () => {
    const [antes] = await banco.execute<{ dividas: number; titulos: number }>(sql`
      SELECT (SELECT count(*)::int FROM dividas WHERE empresa_id = ${cenario.empresaId}) AS dividas,
             (SELECT count(*)::int FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}) AS titulos
    `);

    // A falha e provocada no ULTIMO passo (auditoria, que grava organizacao_id).
    // Divida, cronograma e contas a pagar ja entraram quando ela acontece.
    const escopoQuebrado = { ...escopo, organizacaoId: comoIdentificador<"Organizacao">("nao-e-um-uuid") };
    await expect(dividas.criar(escopoQuebrado, dadosBase(), CRONOGRAMA)).rejects.toThrow();

    const [depois] = await banco.execute<{ dividas: number; titulos: number }>(sql`
      SELECT (SELECT count(*)::int FROM dividas WHERE empresa_id = ${cenario.empresaId}) AS dividas,
             (SELECT count(*)::int FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}) AS titulos
    `);
    expect(depois).toEqual(antes);
  });

  it("recusa credor, categoria ou conta de outra empresa", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      await expect(criarEmprestimo({ credorPessoaId: outra.pessoaFornecedorId })).rejects.toThrow("CREDOR_NAO_ENCONTRADO");
      await expect(criarEmprestimo({ categoriaJurosId: outra.categoriaId })).rejects.toThrow("CATEGORIA_NAO_ENCONTRADA");
      await expect(criarEmprestimo({ contaBancariaCreditoId: outra.contaBancariaId })).rejects.toThrow(
        "CONTA_BANCARIA_NAO_ENCONTRADA",
      );
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  // --------------------------------------------------- credito do emprestimo

  it("o credito do emprestimo entra na conta e NAO e receita", async () => {
    const saldoAntes = (await bancos.buscarPorId(escopo, cenario.contaBancariaId))!.saldoAtual;
    const { dividaId } = await criarEmprestimo({ contaBancariaCreditoId: cenario.contaBancariaId });

    const saldoDepois = (await bancos.buscarPorId(escopo, cenario.contaBancariaId))!.saldoAtual;
    expect(saldoDepois.paraTexto()).toBe(saldoAntes.somar(Dinheiro.deTexto("12000.00")).paraTexto());

    const [movimentacao] = await banco.execute<{ tipo: string; grupo: string }>(sql`
      SELECT m.tipo, cp.grupo_dre::text AS grupo
      FROM movimentacoes_bancarias m
      JOIN categorias_financeiras cf ON cf.id = m.categoria_id
      JOIN contas_plano cp ON cp.id = cf.conta_plano_id
      WHERE m.empresa_id = ${cenario.empresaId} AND m.descricao LIKE 'Crédito do empréstimo%'
      ORDER BY m.criado_em DESC LIMIT 1
    `);
    expect(movimentacao?.tipo).toBe("entrada");
    // Grupo `transferencia` = fora do resultado, por construcao.
    expect(movimentacao?.grupo).toBe("transferencia");

    const resultado = await dre.montar(
      escopo,
      { de: criarDataCivil(2026, 9, 1), ate: criarDataCivil(2026, 9, 30), regime: "caixa" },
      HOJE,
    );
    const receita = resultado.linhas.find((l) => l.linha === "receita_bruta")!;
    expect(receita.total.ehZero()).toBe(true);
    expect(dividaId).toBeTruthy();
  });

  // --------------------------------------- juros x amortizacao no resultado

  it("no DRE, a parcela paga entra SO pelos juros; a amortizacao fica fora", async () => {
    await comEmpresaPropria(async (contexto) => {
    const { dividaId } = await emprestimoEm(contexto);
    await pagarEm(contexto, dividaId, 1, "2026-10-10");

    const outubro = await dre.montar(
      contexto.escopo,
      { de: criarDataCivil(2026, 10, 1), ate: criarDataCivil(2026, 10, 31), regime: "caixa" },
      HOJE,
    );

    // Juros da parcela 1 = 240,00 -> despesa financeira.
    expect(outubro.linhas.find((l) => l.linha === "despesas_financeiras")?.total.paraTexto()).toBe("240.00");
    // Os 894,72 de amortizacao NAO viram despesa operacional.
    expect(outubro.linhas.find((l) => l.linha === "despesas_operacionais")?.total.ehZero()).toBe(true);
    // E o resultado do mes e exatamente -240,00, nao -1.134,72.
    expect(outubro.linhas.find((l) => l.linha === "resultado_periodo")?.total.paraTexto()).toBe("-240.00");
    });
  });

  it("juros de ATRASO somam aos juros da parcela na linha financeira", async () => {
    await comEmpresaPropria(async (contexto) => {
      const { dividaId } = await emprestimoEm(contexto);
      await pagarEm(contexto, dividaId, 1, "2026-10-15", { juros: "35.00" });

      const outubro = await dre.montar(
        contexto.escopo,
        { de: criarDataCivil(2026, 10, 1), ate: criarDataCivil(2026, 10, 31), regime: "caixa" },
        HOJE,
      );
      // 240,00 do cronograma + 35,00 de atraso.
      expect(outubro.linhas.find((l) => l.linha === "despesas_financeiras")?.total.paraTexto()).toBe("275.00");
    });
  });

  it("em COMPETENCIA, so os juros da parcela entram; a amortizacao tambem fica fora", async () => {
    await comEmpresaPropria(async (contexto) => {
      const { dividaId } = await emprestimoEm(contexto);
      const detalhe = await dividas.buscarPorId(contexto.escopo, dividaId, HOJE);

      // O titulo tem competencia 25/09/2026, entao TODAS as parcelas competem a setembro.
      const setembro = await dre.montar(
        contexto.escopo,
        { de: criarDataCivil(2026, 9, 1), ate: criarDataCivil(2026, 9, 30), regime: "competencia" },
        HOJE,
      );
      const jurosEsperados = Dinheiro.somarTodos(detalhe!.parcelas.map((p) => p.valorJuros));

      expect(jurosEsperados.paraTexto()).toBe("1616.59");
      expect(setembro.linhas.find((l) => l.linha === "despesas_financeiras")?.total.paraTexto()).toBe("1616.59");
      expect(setembro.linhas.find((l) => l.linha === "despesas_operacionais")?.total.ehZero()).toBe(true);
    });
  });

  // ---------------------------------------------------------- saldo devedor

  it("o saldo devedor cai a cada parcela paga", async () => {
    const { dividaId } = await criarEmprestimo();
    const inicial = await dividas.buscarPorId(escopo, dividaId, HOJE);
    expect(inicial!.saldoDevedor.paraTexto()).toBe("12000.00");
    expect(inicial!.parcelasPagas).toBe(0);

    await pagarParcela(dividaId, 1, "2026-10-10");
    const apos1 = await dividas.buscarPorId(escopo, dividaId, HOJE);
    expect(apos1!.saldoDevedor.paraTexto()).toBe("11105.28");
    expect(apos1!.parcelasPagas).toBe(1);

    await pagarParcela(dividaId, 2, "2026-11-10");
    const apos2 = await dividas.buscarPorId(escopo, dividaId, HOJE);
    expect(apos2!.saldoDevedor.paraTexto()).toBe("10192.67");
    expect(apos2!.parcelasPagas).toBe(2);
  });

  it("ESTORNAR uma parcela devolve o saldo devedor", async () => {
    await comEmpresaPropria(async (contexto) => {
      const { dividaId } = await emprestimoEm(contexto);
      const { pagamentoId } = await pagarEm(contexto, dividaId, 1, "2026-10-10");
      expect((await dividas.buscarPorId(contexto.escopo, dividaId, HOJE))!.saldoDevedor.paraTexto()).toBe("11105.28");

      await contasPagar.estornarPagamento(contexto.escopo, pagamentoId, {
        motivo: "Pagamento em duplicidade",
        dataEstorno: dataCivilDeTexto("2026-10-12"),
        usuarioId,
      });

      const apos = await dividas.buscarPorId(contexto.escopo, dividaId, HOJE);
      expect(apos!.saldoDevedor.paraTexto()).toBe("12000.00");
      expect(apos!.parcelasPagas).toBe(0);

      // E o DRE tambem esquece os juros da baixa estornada.
      const outubro = await dre.montar(
        contexto.escopo,
        { de: criarDataCivil(2026, 10, 1), ate: criarDataCivil(2026, 10, 31), regime: "caixa" },
        HOJE,
      );
      expect(outubro.linhas.find((l) => l.linha === "despesas_financeiras")?.total.ehZero()).toBe(true);
    });
  });

  it("CANCELAR a divida cancela o que ainda nao foi pago e mantem o que ja foi", async () => {
    const { dividaId } = await criarEmprestimo();
    await pagarParcela(dividaId, 1, "2026-10-10");

    await dividas.cancelar(escopo, dividaId, { motivo: "Contrato quitado antecipadamente", usuarioId });

    const apos = await dividas.buscarPorId(escopo, dividaId, HOJE);
    // A parcela ja paga continua paga: o dinheiro saiu de verdade.
    expect(apos!.situacao).toBe("cancelada");
    expect(apos!.parcelas.filter((p) => p.situacao === "cancelada")).toHaveLength(11);
    expect(apos!.parcelas.filter((p) => p.situacao === "liquidada")).toHaveLength(1);

    // As contas a pagar em aberto tambem foram canceladas.
    const [abertas] = await banco.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM parcelas_pagar pp
      JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
      WHERE pd.divida_id = ${dividaId} AND pp.situacao = 'aberta'
    `);
    expect(Number(abertas?.total)).toBe(0);
  });

  it("recusa cancelar duas vezes e exige motivo", async () => {
    const { dividaId } = await criarEmprestimo();
    await expect(dividas.cancelar(escopo, dividaId, { motivo: "  ", usuarioId })).rejects.toThrow("MOTIVO_OBRIGATORIO");
    await dividas.cancelar(escopo, dividaId, { motivo: "Motivo valido", usuarioId });
    await expect(dividas.cancelar(escopo, dividaId, { motivo: "De novo", usuarioId })).rejects.toThrow("DIVIDA_JA_CANCELADA");
  });

  // ------------------------------------------------------------ painel

  it("o painel soma o endividamento e as parcelas dos proximos doze meses", async () => {
    // Um cenario proprio, para o painel nao somar as dividas dos outros testes.
    const isolado = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoIsolado = {
        organizacaoId: comoIdentificador<"Organizacao">(isolado.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(isolado.empresaId),
      };
      const [conta] = await banco.execute<{ id: string }>(sql`
        INSERT INTO contas_plano (empresa_id, codigo, nome, grupo_dre)
        VALUES (${isolado.empresaId}, '4.7.01', 'Financeiras', 'resultado_financeiro') RETURNING id::text AS id
      `);
      const [categoria] = await banco.execute<{ id: string }>(sql`
        INSERT INTO categorias_financeiras (empresa_id, nome, conta_plano_id)
        VALUES (${isolado.empresaId}, 'Juros', ${conta!.id}) RETURNING id::text AS id
      `);

      const { dividaId } = await dividas.criar(
        escopoIsolado,
        { ...dadosBase(), credorPessoaId: isolado.pessoaFornecedorId, categoriaJurosId: categoria!.id },
        CRONOGRAMA,
      );

      const painel = await dividas.painel(escopoIsolado, dataCivilDeTexto("2026-10-01"));
      expect(painel.endividamentoTotal.paraTexto()).toBe("12000.00");
      expect(painel.dividasAtivas).toBe(1);
      // Vencimentos de 10/10/2026 a 10/09/2027 caem na janela de doze meses.
      expect(painel.proximosDozeMeses).toHaveLength(12);
      expect(painel.totalProximosDozeMeses.paraTexto()).toBe("13616.59"); // 12.000 + 1.616,59
      expect(painel.jurosPagosNoAno.ehZero()).toBe(true);
      expect(dividaId).toBeTruthy();
    } finally {
      await banco.execute(sql`DELETE FROM parcelas_divida WHERE empresa_id = ${isolado.empresaId}`);
      await banco.execute(sql`DELETE FROM dividas WHERE empresa_id = ${isolado.empresaId}`);
      await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${isolado.empresaId}`);
      await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${isolado.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${isolado.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, isolado);
    }
  });

  // -------------------------------------------------------- isolamento

  it("ISOLAMENTO: uma empresa nao ve nem cancela a divida da outra", async () => {
    const { dividaId } = await criarEmprestimo();
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };

      expect(await dividas.listar(escopoOutra, HOJE)).toEqual([]);
      expect(await dividas.buscarPorId(escopoOutra, dividaId, HOJE)).toBeNull();
      await expect(dividas.cancelar(escopoOutra, dividaId, { motivo: "Tentativa de fora", usuarioId })).rejects.toThrow(
        "DIVIDA_NAO_ENCONTRADA",
      );

      const painel = await dividas.painel(escopoOutra, HOJE);
      expect(painel.endividamentoTotal.ehZero()).toBe(true);
      expect(painel.proximosDozeMeses).toEqual([]);
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
