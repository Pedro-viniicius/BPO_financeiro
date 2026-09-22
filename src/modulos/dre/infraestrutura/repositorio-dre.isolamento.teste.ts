import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto, hojeDataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
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
import { RepositorioDividasDrizzle } from "@/modulos/credito-dividas/publico";
import { gerarCronograma } from "@/compartilhado/financeiro/indice";

import type { LinhaDre } from "../dominio/estrutura-dre";
import { RepositorioDreDrizzle } from "./repositorio-dre-drizzle";

/**
 * O demonstrativo de resultados contra PostgreSQL real.
 *
 * Os dois testes que mandam neste arquivo sao os de INVARIANTE:
 *
 *   CAIXA        resultado = entradas − saidas das movimentacoes do periodo
 *                MAIS a amortizacao das parcelas de divida pagas nele,
 *                excluindo transferencia, estorno e ajuste. Se as duas contas
 *                divergirem, o extrato e o DRE contam historias diferentes
 *                sobre o mesmo mes e o usuario nao tem como saber em qual
 *                acreditar.
 *
 *                A AMORTIZACAO E O UNICO TERMO QUE SOBRA, e ela SOMA porque e
 *                uma saida que o resultado nao conta: pagar uma parcela de
 *                emprestimo tira R$ 1.134,72 do banco, mas so R$ 240,00 disso
 *                e despesa — o resto e divida virando patrimonio. Contar o
 *                total como despesa faria o resultado do mes cair pelo simples
 *                ato de honrar o contrato. O credito do emprestimo e o espelho
 *                disso (entra dinheiro que nao e receita), mas ja sai antes da
 *                conta, por `origem = 'ajuste_manual'`.
 *   COMPETENCIA  soma dos titulos nao cancelados da competencia, mais
 *                juros/multas e menos descontos.
 *
 * O cenario e um mes de setembro/2026 com TODOS os casos de borda que o gate
 * pede: receita, despesa, juros, multa, desconto, estorno, cancelamento,
 * transferencia, ajuste de saldo e lancamento criado na conciliacao.
 */
describe.skipIf(!urlBancoTeste)("demonstrativo de resultados (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const dre = new RepositorioDreDrizzle(banco as never);
  const bancos = new RepositorioContasBancariasDrizzle(banco as never);
  const contasPagar = new RepositorioContasPagarDrizzle(banco as never);
  const contasReceber = new RepositorioContasReceberDrizzle(banco as never);

  const HOJE = dataCivilDeTexto("2026-10-15");
  const SETEMBRO = { de: dataCivilDeTexto("2026-09-01"), ate: dataCivilDeTexto("2026-09-30") };

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";
  let categoriaReceita = "";
  let categoriaDespesa = "";
  let categoriaTarifa = "";
  let categoriaFinanceira = "";

  const caixa = (extras: Record<string, unknown> = {}) => ({ ...SETEMBRO, regime: "caixa" as const, ...extras });
  const competencia = (extras: Record<string, unknown> = {}) => ({ ...SETEMBRO, regime: "competencia" as const, ...extras });

  const valorDa = (linhas: readonly { linha: LinhaDre; total: Dinheiro }[], linha: LinhaDre) =>
    linhas.find((l) => l.linha === linha)!.total.paraTexto();

  /** Cria uma categoria ligada a uma conta do plano no grupo pedido. */
  async function categoriaEm(grupo: string, codigo: string, nome: string): Promise<string> {
    const [conta] = await banco.execute<{ id: string }>(sql`
      INSERT INTO contas_plano (empresa_id, codigo, nome, grupo_dre)
      VALUES (${cenario.empresaId}, ${codigo}, ${nome}, ${grupo}::grupo_dre)
      RETURNING id::text AS id
    `);
    const [categoria] = await banco.execute<{ id: string }>(sql`
      INSERT INTO categorias_financeiras (empresa_id, nome, conta_plano_id)
      VALUES (${cenario.empresaId}, ${nome}, ${conta!.id})
      RETURNING id::text AS id
    `);
    return categoria!.id;
  }

  async function contaPagar(valor: string, vencimento: string, categoriaId: string) {
    return contasPagar.criar(
      escopo,
      {
        descricao: `Despesa ${vencimento}`,
        fornecedorId: cenario.fornecedorId,
        categoriaId,
        dataCompetencia: dataCivilDeTexto(`${vencimento.slice(0, 8)}01`),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
  }

  async function contaReceber(valor: string, vencimento: string, categoriaId: string) {
    return contasReceber.criar(
      escopo,
      {
        descricao: `Receita ${vencimento}`,
        clienteId: cenario.clienteId,
        categoriaId,
        dataCompetencia: dataCivilDeTexto(`${vencimento.slice(0, 8)}01`),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
  }

  const baixaPagar = (parcelaId: string, data: string, principal: string, extras: Partial<{ juros: string; multa: string; desconto: string }> = {}) =>
    contasPagar.registrarPagamento(escopo, parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto(data),
      valorPrincipal: Dinheiro.deTexto(principal),
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.deTexto(extras.multa ?? "0.00"),
      valorDesconto: Dinheiro.deTexto(extras.desconto ?? "0.00"),
      formaPagamento: "pix",
      usuarioId,
    });

  const baixaReceber = (parcelaId: string, data: string, principal: string, extras: Partial<{ juros: string; multa: string; desconto: string }> = {}) =>
    contasReceber.registrarRecebimento(escopo, parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataRecebimento: dataCivilDeTexto(data),
      valorPrincipal: Dinheiro.deTexto(principal),
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.deTexto(extras.multa ?? "0.00"),
      valorDesconto: Dinheiro.deTexto(extras.desconto ?? "0.00"),
      formaPagamento: "pix",
      usuarioId,
    });

  /** Σ entradas − Σ saidas das movimentacoes do periodo, sem o que nao e resultado. */
  async function movimentoLiquidoDeSetembro(): Promise<string> {
    const [linha] = await banco.execute<{ liquido: string }>(sql`
      SELECT COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END), 0)::text AS liquido
      FROM movimentacoes_bancarias m
      WHERE m.empresa_id = ${cenario.empresaId}
        AND m.data_movimentacao BETWEEN '2026-09-01' AND '2026-09-30'
        AND m.origem NOT IN ('transferencia', 'estorno', 'ajuste_manual')
        -- Movimentacao cuja baixa foi estornada tambem sai: o estorno desfaz
        -- o fato, e o DRE deixa de conta-lo.
        AND NOT EXISTS (
          SELECT 1 FROM movimentacoes_bancarias e WHERE e.movimentacao_estornada_id = m.id
        )
    `);
    return Dinheiro.deTexto(linha?.liquido ?? "0").somar(await amortizacaoPagaEmSetembro()).paraTexto();
  }

  /**
   * A parte das baixas de setembro que abateu divida.
   *
   * Calculada com a MESMA regra proporcional do repositorio: `valor_principal`
   * de uma baixa e o abatimento da parcela, e ele se reparte entre amortizacao
   * e juros na proporcao do cronograma. Escrever aqui uma regra mais simples
   * ("e o valor_amortizacao da parcela") faria o teste passar so enquanto
   * ninguem pagasse uma parcela pela metade.
   */
  async function amortizacaoPagaEmSetembro(contaBancariaId?: string): Promise<Dinheiro> {
    const filtroDeConta = contaBancariaId ? sql`AND p.conta_bancaria_id = ${contaBancariaId}` : sql``;
    const [linha] = await banco.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(
        CASE WHEN pd.valor_total = 0 THEN 0
             ELSE round(p.valor_principal * pd.valor_amortizacao / pd.valor_total, 2)
        END
      ), 0)::text AS total
      FROM pagamentos p
      JOIN parcelas_pagar pp ON pp.id = p.parcela_pagar_id
      JOIN parcelas_divida pd ON pd.parcela_pagar_id = pp.id
      WHERE p.empresa_id = ${cenario.empresaId}
        AND p.situacao = 'registrado'
        AND p.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30'
        ${filtroDeConta}
    `);
    return Dinheiro.deTexto(linha?.total ?? "0");
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
      VALUES (${usuarioId}, 'Teste DRE', ${`dre-${usuarioId}@exemplo.local`}, false, now(), now())
    `);

    categoriaReceita = await categoriaEm("receita_bruta", "3.9.01", "Mensalidades DRE");
    categoriaDespesa = await categoriaEm("despesa_operacional", "4.9.01", "Aluguel DRE");
    categoriaTarifa = await categoriaEm("resultado_financeiro", "4.9.02", "Tarifas DRE");
    categoriaFinanceira = await categoriaEm("resultado_financeiro", "4.9.03", "Juros de empréstimos DRE");

    // 1. Receita recebida em dia: 10.000.
    const receita = await contaReceber("10000.00", "2026-09-05", categoriaReceita);
    await baixaReceber(receita.parcelaId, "2026-09-05", "10000.00");

    // 2. Receita com juros e multa (cliente atrasou): 2.000 + 50 juros + 30 multa.
    const atrasada = await contaReceber("2000.00", "2026-09-08", categoriaReceita);
    await baixaReceber(atrasada.parcelaId, "2026-09-12", "2000.00", { juros: "50.00", multa: "30.00" });

    // 3. Receita com desconto concedido: 1.000 quitada com 950 + 50 de desconto.
    const comDesconto = await contaReceber("1000.00", "2026-09-10", categoriaReceita);
    await baixaReceber(comDesconto.parcelaId, "2026-09-10", "950.00", { desconto: "50.00" });

    // 4. Despesa paga: 4.000.
    const despesa = await contaPagar("4000.00", "2026-09-06", categoriaDespesa);
    await baixaPagar(despesa.parcelaId, "2026-09-06", "4000.00");

    // 5. Despesa com desconto obtido: 500 quitada com 480 + 20.
    const despesaComDesconto = await contaPagar("500.00", "2026-09-07", categoriaDespesa);
    await baixaPagar(despesaComDesconto.parcelaId, "2026-09-07", "480.00", { desconto: "20.00" });

    // 6. Despesa paga com juros: 300 + 15 de juros.
    const despesaComJuros = await contaPagar("300.00", "2026-09-09", categoriaDespesa);
    await baixaPagar(despesaComJuros.parcelaId, "2026-09-11", "300.00", { juros: "15.00" });

    // 7. Pagamento ESTORNADO: nao pode entrar em lugar nenhum.
    const estornada = await contaPagar("700.00", "2026-09-14", categoriaDespesa);
    const { pagamentoId } = await baixaPagar(estornada.parcelaId, "2026-09-14", "700.00");
    await contasPagar.estornarPagamento(escopo, pagamentoId, {
      motivo: "Pago em duplicidade",
      dataEstorno: dataCivilDeTexto("2026-09-15"),
      usuarioId,
    });

    // 8. Conta CANCELADA sem baixa: fora dos dois regimes.
    const cancelada = await contaPagar("900.00", "2026-09-20", categoriaDespesa);
    const detalhe = await contasPagar.buscarPorId(escopo, cancelada.parcelaId, HOJE);
    await contasPagar.cancelar(escopo, detalhe!.tituloId, { motivo: "Servico nao prestado", usuarioId });

    // 9. Conta cancelada COM baixa parcial: so a parte liquidada entra na competencia.
    const parcial = await contaPagar("600.00", "2026-09-22", categoriaDespesa);
    await baixaPagar(parcial.parcelaId, "2026-09-22", "200.00");
    const detalheParcial = await contasPagar.buscarPorId(escopo, parcial.parcelaId, HOJE);
    await contasPagar.cancelar(escopo, detalheParcial!.tituloId, { motivo: "Acordo com o fornecedor", usuarioId });

    // 10. Transferencia entre contas proprias: fora do resultado.
    await bancos.criarTransferencia(escopo, {
      contaOrigemId: cenario.contaBancariaId,
      contaDestinoId: cenario.contaCaixaId,
      data: dataCivilDeTexto("2026-09-18"),
      valor: Dinheiro.deTexto("1500.00"),
      usuarioId,
    });

    // 11. Ajuste de saldo: fora do resultado.
    await bancos.registrarAjuste(escopo, cenario.contaBancariaId, {
      tipo: "saida",
      valor: Dinheiro.deTexto("13.00"),
      data: dataCivilDeTexto("2026-09-25"),
      motivo: "Diferenca de centavos",
      usuarioId,
    });

    // 12. Lancamento criado na conciliacao (tarifa): entra pela categoria.
    await banco.execute(sql`
      INSERT INTO movimentacoes_bancarias (empresa_id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, origem, categoria_id)
      VALUES (${cenario.empresaId}, ${cenario.contaBancariaId}, '2026-09-28', 'saida', '40.00', 'TARIFA MANUTENCAO', 'extrato', ${categoriaTarifa})
    `);

    // 13. Conta a pagar de setembro AINDA EM ABERTO: so na competencia.
    await contaPagar("1200.00", "2026-09-30", categoriaDespesa);

    /*
     * 14. EMPRESTIMO com uma parcela paga em setembro.
     *
     * E o caso que quebraria a invariante antiga: saem R$ 1.134,72 do banco,
     * mas so R$ 240,00 sao despesa. Sem a divida no cenario, a invariante
     * "movimentacoes − amortizacao" continuaria passando por vacuidade, e
     * ninguem saberia que o termo novo esta certo.
     */
    const dividas = new RepositorioDividasDrizzle(banco as never);
    const { dividaId } = await dividas.criar(
      escopo,
      {
        credorPessoaId: cenario.pessoaFornecedorId,
        tipo: "emprestimo",
        descricao: "Capital de giro",
        dataContratacao: dataCivilDeTexto("2026-08-25"),
        valorPrincipal: Dinheiro.deTexto("12000.00"),
        taxaMensal: 2,
        sistema: "price",
        categoriaJurosId: categoriaFinanceira,
        usuarioId,
      },
      gerarCronograma({
        valorPrincipal: Dinheiro.deTexto("12000.00"),
        taxaMensal: 2,
        quantidadeParcelas: 12,
        primeiroVencimento: dataCivilDeTexto("2026-09-25") as DataVencimento,
        sistema: "price",
      }),
    );
    const emprestimo = await dividas.buscarPorId(escopo, dividaId, HOJE);
    const primeira = emprestimo!.parcelas[0]!;
    await baixaPagar(primeira.parcelaPagarId!, "2026-09-25", primeira.valorTotal.paraTexto());
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM transferencias WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM recebimentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_divida WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM dividas WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  // ------------------------------------------------------------ invariantes

  it("INVARIANTE DE CAIXA: resultado = entradas − saídas das movimentações do período", async () => {
    const resultado = await dre.montar(escopo, caixa(), HOJE);
    expect(valorDa(resultado.linhas, "resultado_periodo")).toBe(await movimentoLiquidoDeSetembro());
  });

  it("INVARIANTE DE CAIXA vale tambem por conta bancaria", async () => {
    const resultado = await dre.montar(escopo, caixa({ contaBancariaId: cenario.contaBancariaId }), HOJE);
    const [linha] = await banco.execute<{ liquido: string }>(sql`
      SELECT COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END), 0)::text AS liquido
      FROM movimentacoes_bancarias m
      WHERE m.empresa_id = ${cenario.empresaId}
        AND m.conta_bancaria_id = ${cenario.contaBancariaId}
        AND m.data_movimentacao BETWEEN '2026-09-01' AND '2026-09-30'
        AND m.origem NOT IN ('transferencia', 'estorno', 'ajuste_manual')
        AND NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias e WHERE e.movimentacao_estornada_id = m.id)
    `);
    const esperado = Dinheiro.deTexto(linha!.liquido).somar(await amortizacaoPagaEmSetembro(cenario.contaBancariaId));
    expect(valorDa(resultado.linhas, "resultado_periodo")).toBe(esperado.paraTexto());
  });

  it("INVARIANTE DE COMPETENCIA: titulos nao cancelados + juros/multas − descontos", async () => {
    const resultado = await dre.montar(escopo, competencia(), HOJE);

    const [titulos] = await banco.execute<{ receber: string; pagar: string }>(sql`
      SELECT
        COALESCE((SELECT SUM(CASE WHEN pr.situacao IN ('aberta','liquidada') THEN pr.valor_original ELSE pr.valor_recebido END)
                  FROM parcelas_receber pr JOIN titulos_receber t ON t.id = pr.titulo_receber_id
                  WHERE t.empresa_id = ${cenario.empresaId} AND t.data_competencia BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS receber,
        COALESCE((SELECT SUM(CASE WHEN pp.situacao IN ('aberta','liquidada') THEN pp.valor_original ELSE pp.valor_pago END)
                  FROM parcelas_pagar pp JOIN titulos_pagar t ON t.id = pp.titulo_pagar_id
                  WHERE t.empresa_id = ${cenario.empresaId} AND t.data_competencia BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS pagar
    `);
    const [baixas] = await banco.execute<{ juros_rec: string; desc_conc: string; juros_pag: string; desc_obt: string }>(sql`
      SELECT
        COALESCE((SELECT SUM(valor_juros + valor_multa) FROM recebimentos
                  WHERE empresa_id = ${cenario.empresaId} AND situacao = 'registrado'
                    AND data_recebimento BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS juros_rec,
        COALESCE((SELECT SUM(valor_desconto) FROM recebimentos
                  WHERE empresa_id = ${cenario.empresaId} AND situacao = 'registrado'
                    AND data_recebimento BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS desc_conc,
        COALESCE((SELECT SUM(valor_juros + valor_multa) FROM pagamentos
                  WHERE empresa_id = ${cenario.empresaId} AND situacao = 'registrado'
                    AND data_pagamento BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS juros_pag,
        COALESCE((SELECT SUM(valor_desconto) FROM pagamentos
                  WHERE empresa_id = ${cenario.empresaId} AND situacao = 'registrado'
                    AND data_pagamento BETWEEN '2026-09-01' AND '2026-09-30'), 0)::text AS desc_obt
    `);

    // A tarifa criada na conciliacao entra nos dois regimes, pela categoria.
    const esperado = Dinheiro.deTexto(titulos!.receber)
      .subtrair(Dinheiro.deTexto(titulos!.pagar))
      .somar(Dinheiro.deTexto(baixas!.juros_rec))
      .subtrair(Dinheiro.deTexto(baixas!.desc_conc))
      .subtrair(Dinheiro.deTexto(baixas!.juros_pag))
      .somar(Dinheiro.deTexto(baixas!.desc_obt))
      .subtrair(Dinheiro.deTexto("40.00"));

    expect(valorDa(resultado.linhas, "resultado_periodo")).toBe(esperado.paraTexto());
  });

  // ---------------------------------------------------- linhas, no caixa

  it("as linhas do regime de caixa batem com o esperado, uma a uma", async () => {
    const { linhas } = await dre.montar(escopo, caixa(), HOJE);

    // Recebido: 10.000 + 2.000 + 1.000 (o principal da baixa com desconto e o
    // ABATIMENTO cheio, e o desconto aparece na linha propria).
    expect(valorDa(linhas, "receita_bruta")).toBe("13000.00");
    expect(valorDa(linhas, "deducoes")).toBe("0.00");
    expect(valorDa(linhas, "descontos_concedidos")).toBe("50.00");
    expect(valorDa(linhas, "receita_liquida")).toBe("12950.00");

    // Pago: 4.000 + 500 + 300 + 200 (a parcial da conta depois cancelada).
    // O pagamento de 700 foi estornado e NAO entra.
    expect(valorDa(linhas, "despesas_operacionais")).toBe("5000.00");
    expect(valorDa(linhas, "resultado_operacional")).toBe("7950.00");

    expect(valorDa(linhas, "receitas_financeiras")).toBe("80.00"); // 50 juros + 30 multa

    /*
     * 15 de juros de atraso + 40 de tarifa + 240 dos JUROS da parcela do
     * emprestimo. Os outros R$ 894,72 daquela parcela sairam do banco e nao
     * aparecem em lugar nenhum do resultado: sao amortizacao.
     */
    expect(valorDa(linhas, "despesas_financeiras")).toBe("295.00");
    expect(valorDa(linhas, "descontos_obtidos")).toBe("20.00");
    expect(valorDa(linhas, "resultado_periodo")).toBe("7755.00");
  });

  it("as linhas do regime de competencia batem com o esperado", async () => {
    const { linhas } = await dre.montar(escopo, competencia(), HOJE);

    // Titulos a receber de setembro: 10.000 + 2.000 + 1.000.
    expect(valorDa(linhas, "receita_bruta")).toBe("13000.00");
    // A pagar: 4.000 + 500 + 300 + 700 (estornada, mas o TITULO continua de pe)
    //          + 200 (parte liquidada da cancelada) + 1.200 (ainda em aberto).
    // A cancelada sem baixa (900) fica de fora.
    expect(valorDa(linhas, "despesas_operacionais")).toBe("6900.00");
    expect(valorDa(linhas, "receitas_financeiras")).toBe("80.00");
    expect(valorDa(linhas, "despesas_financeiras")).toBe("55.00");
  });

  it("o mesmo mes da resultados diferentes nos dois regimes — e e esse o ponto", async () => {
    const porCaixa = await dre.montar(escopo, caixa(), HOJE);
    const porCompetencia = await dre.montar(escopo, competencia(), HOJE);
    expect(porCaixa.indicadores.resultado.paraTexto()).not.toBe(porCompetencia.indicadores.resultado.paraTexto());
  });

  // --------------------------------------------------- casos de exclusao

  it("transferencia entre contas proprias nao aparece em NENHUMA linha", async () => {
    for (const filtro of [caixa(), competencia()]) {
      const { linhas } = await dre.montar(escopo, filtro, HOJE);
      const todas = linhas.flatMap((l) => l.categorias.map((c) => c.categoriaNome));
      expect(todas).not.toContain("Transferências entre contas");
      // 1.500 nao aparece em canto nenhum do demonstrativo.
      expect(linhas.every((l) => l.total.paraTexto() !== "1500.00")).toBe(true);
    }
  });

  it("ajuste de saldo nao entra: a categoria dele vive no grupo transferencia", async () => {
    const { linhas } = await dre.montar(escopo, caixa(), HOJE);
    const categorias = linhas.flatMap((l) => l.categorias.map((c) => c.categoriaNome));
    expect(categorias).not.toContain("Ajuste de saldo");
  });

  it("baixa estornada nao entra no caixa", async () => {
    const { linhas } = await dre.montar(escopo, caixa(), HOJE);
    // 5.000 de despesa; com a estornada seriam 5.700.
    expect(valorDa(linhas, "despesas_operacionais")).toBe("5000.00");
  });

  it("conta cancelada sem baixa fica fora dos dois regimes", async () => {
    for (const filtro of [caixa(), competencia()]) {
      const { linhas } = await dre.montar(escopo, filtro, HOJE);
      const detalhes = await dre.lancamentosDaLinha(escopo, filtro, "despesas_operacionais");
      expect(detalhes.every((d) => !d.descricao.includes("2026-09-20"))).toBe(true);
      expect(linhas.length).toBeGreaterThan(0);
    }
  });

  it("conta cancelada COM baixa parcial entra so pela parte liquidada", async () => {
    const detalhes = await dre.lancamentosDaLinha(escopo, competencia(), "despesas_operacionais");
    const daCancelada = detalhes.filter((d) => d.origem.startsWith("cancelada"));
    expect(daCancelada).toHaveLength(1);
    expect(daCancelada[0]?.valor.paraTexto()).toBe("200.00");
  });

  it("lancamento criado na conciliacao aparece na categoria certa", async () => {
    const { linhas } = await dre.montar(escopo, caixa(), HOJE);
    const financeiras = linhas.find((l) => l.linha === "despesas_financeiras")!;
    const tarifa = financeiras.categorias.find((c) => c.categoriaNome === "Tarifas DRE");
    expect(tarifa?.total.paraTexto()).toBe("40.00");
  });

  // ------------------------------------------------------- detalhamento

  it("DRILL-DOWN: a soma dos lancamentos listados e exatamente o valor da linha", async () => {
    for (const filtro of [caixa(), competencia()]) {
      const { linhas } = await dre.montar(escopo, filtro, HOJE);
      for (const linha of linhas.filter((l) => !l.ehSubtotal && !l.total.ehZero())) {
        const detalhes = await dre.lancamentosDaLinha(escopo, filtro, linha.linha);
        const soma = Dinheiro.somarTodos(detalhes.map((d) => d.valor));
        expect(soma.paraTexto(), `${filtro.regime} · ${linha.linha}`).toBe(linha.total.paraTexto());
      }
    }
  });

  it("DRILL-DOWN por categoria tambem fecha", async () => {
    const { linhas } = await dre.montar(escopo, caixa(), HOJE);
    for (const linha of linhas.filter((l) => l.categorias.length > 0)) {
      for (const categoria of linha.categorias) {
        const detalhes = await dre.lancamentosDaLinha(escopo, caixa(), linha.linha, {
          categoriaNome: categoria.categoriaNome,
        });
        expect(Dinheiro.somarTodos(detalhes.map((d) => d.valor)).paraTexto()).toBe(categoria.total.paraTexto());
      }
    }
  });

  it("cada lancamento do detalhamento leva de volta a origem dele", async () => {
    const detalhes = await dre.lancamentosDaLinha(escopo, caixa(), "despesas_financeiras");
    expect(detalhes.length).toBeGreaterThan(0);
    expect(detalhes.every((d) => d.rota.startsWith("/contas-") || d.rota.startsWith("/bancos/"))).toBe(true);
  });

  // ------------------------------------------------- meses e indicadores

  it("o comparativo mensal separa os meses e calcula a variacao", async () => {
    const resultado = await dre.montar(
      escopo,
      { de: dataCivilDeTexto("2026-08-01"), ate: dataCivilDeTexto("2026-09-30"), regime: "caixa" },
      HOJE,
    );
    expect(resultado.meses.map((m) => m.competencia)).toEqual(["2026-08", "2026-09"]);

    const receita = resultado.linhas.find((l) => l.linha === "receita_bruta")!;
    expect(receita.porMes[0]?.paraTexto()).toBe("0.00");
    expect(receita.porMes[1]?.paraTexto()).toBe("13000.00");
    expect(receita.variacoes[0]).toBeNull();
    // Agosto zerado: sem base nao ha variacao.
    expect(receita.variacoes[1]).toBeNull();
  });

  it("os indicadores do topo saem das mesmas linhas da tabela", async () => {
    const resultado = await dre.montar(escopo, caixa(), HOJE);
    expect(resultado.indicadores.receitaLiquida.paraTexto()).toBe(valorDa(resultado.linhas, "receita_liquida"));
    expect(resultado.indicadores.resultado.paraTexto()).toBe(valorDa(resultado.linhas, "resultado_periodo"));
    // 5.000 operacionais + 295 financeiras (15 + 40 + 240 de juros da divida).
    expect(resultado.indicadores.despesaTotal.paraTexto()).toBe("5295.00");
    expect(resultado.indicadores.margem).toBeCloseTo(59.88, 1);
  });

  it("periodo sem nada devolve tudo zerado e avisa que nao ha dados", async () => {
    const resultado = await dre.montar(
      escopo,
      { de: dataCivilDeTexto("2025-01-01"), ate: dataCivilDeTexto("2025-01-31"), regime: "caixa" },
      HOJE,
    );
    expect(resultado.temDados).toBe(false);
    expect(resultado.indicadores.resultado.paraTexto()).toBe("0.00");
    expect(resultado.indicadores.margem).toBeNull();
  });

  it("o filtro por conta e desligado no regime de competencia", async () => {
    expect((await dre.montar(escopo, caixa(), HOJE)).filtroPorContaDisponivel).toBe(true);
    expect((await dre.montar(escopo, competencia(), HOJE)).filtroPorContaDisponivel).toBe(false);
  });

  // ------------------------------------------------------ fuso horario

  it("a virada de mes respeita o fuso de Sao Paulo", async () => {
    // 01/10 01:00 UTC = 30/09 22:00 em Sao Paulo: ainda e setembro.
    const instante = new Date("2026-10-01T01:00:00Z");
    expect(hojeDataCivil("America/Sao_Paulo", instante)).toBe("2026-09-30");
    expect(hojeDataCivil("UTC", instante)).toBe("2026-10-01");

    // A tarifa de 28/09 pertence a setembro, e nao a outubro.
    const setembro = await dre.montar(escopo, caixa(), HOJE);
    const outubro = await dre.montar(
      escopo,
      { de: dataCivilDeTexto("2026-10-01"), ate: dataCivilDeTexto("2026-10-31"), regime: "caixa" },
      HOJE,
    );
    expect(valorDa(setembro.linhas, "despesas_financeiras")).toBe("295.00");
    expect(valorDa(outubro.linhas, "despesas_financeiras")).toBe("0.00");
  });

  // -------------------------------------------------------- isolamento

  it("ISOLAMENTO: o demonstrativo de uma empresa nao enxerga o dinheiro da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      for (const filtro of [caixa(), competencia()]) {
        const resultado = await dre.montar(escopoOutra, filtro, HOJE);
        expect(resultado.temDados, filtro.regime).toBe(false);
        expect(resultado.indicadores.resultado.paraTexto()).toBe("0.00");
        expect(await dre.lancamentosDaLinha(escopoOutra, filtro, "despesas_operacionais")).toEqual([]);
      }
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("ISOLAMENTO: escolher a conta de outra empresa nao vaza nada", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const resultado = await dre.montar(escopo, caixa({ contaBancariaId: outra.contaBancariaId }), HOJE);
      expect(resultado.indicadores.resultado.paraTexto()).toBe("0.00");
      expect(resultado.temDados).toBe(false);
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
