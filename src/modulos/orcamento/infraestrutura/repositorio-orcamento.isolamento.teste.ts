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
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";
import { RepositorioContasReceberDrizzle } from "@/modulos/contas-receber/publico";
import { RepositorioDreDrizzle } from "@/modulos/dre/publico";

import { distribuirNoAno, repetirNosDozeMeses } from "../dominio/planilha-do-orcamento";
import { RepositorioOrcamentoDrizzle } from "./repositorio-orcamento-drizzle";
import type { ValorPlanejado } from "../aplicacao/repositorio-orcamento";

/**
 * Orcamento contra PostgreSQL real.
 *
 * O teste que manda neste arquivo e o de MESMA FONTE: o realizado que o
 * orcamento mostra tem de ser, ao centavo, o mesmo que a tela de Resultados
 * mostra para a mesma categoria, periodo e regime. Se as duas telas
 * discordarem, o usuario nao tem como saber qual acreditar — e a resposta
 * certa seria "nenhuma".
 */
describe.skipIf(!urlBancoTeste)("orcamento anual (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const orcamento = new RepositorioOrcamentoDrizzle(banco as never);
  const dre = new RepositorioDreDrizzle(banco as never);
  const contasPagar = new RepositorioContasPagarDrizzle(banco as never);
  const contasReceber = new RepositorioContasReceberDrizzle(banco as never);

  const HOJE = dataCivilDeTexto("2026-10-15");
  const ANO = 2026;

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";
  let aluguel = "";
  let mensalidades = "";

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

  async function gastar(valor: string, data: string, categoriaId: string) {
    const { parcelaId } = await contasPagar.criar(
      escopo,
      {
        descricao: `Gasto ${data}`,
        fornecedorId: cenario.fornecedorId,
        categoriaId,
        dataCompetencia: dataCivilDeTexto(`${data.slice(0, 8)}01`),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(data) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
    await contasPagar.registrarPagamento(escopo, parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto(data),
      valorPrincipal: Dinheiro.deTexto(valor),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });
  }

  async function faturar(valor: string, data: string, categoriaId: string) {
    const { parcelaId } = await contasReceber.criar(
      escopo,
      {
        descricao: `Receita ${data}`,
        clienteId: cenario.clienteId,
        categoriaId,
        dataCompetencia: dataCivilDeTexto(`${data.slice(0, 8)}01`),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(data) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
    await contasReceber.registrarRecebimento(escopo, parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataRecebimento: dataCivilDeTexto(data),
      valorPrincipal: Dinheiro.deTexto(valor),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });
  }

  const grade = (categoriaId: string, valores: readonly Dinheiro[]): ValorPlanejado[] =>
    valores.map((valor, indice) => ({ categoriaId, mes: indice + 1, valor }));

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    usuarioId = crypto.randomUUID();
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Orcamento', ${`or-${usuarioId}@exemplo.local`}, false, now(), now())
    `);

    aluguel = await categoriaEm("despesa_operacional", "4.8.01", "Aluguel orcado");
    mensalidades = await categoriaEm("receita_bruta", "3.8.01", "Mensalidades orcadas");

    // Setembro/2026: gasta 4.200 de aluguel (orcado 4.000 -> estoura)
    await gastar("4200.00", "2026-09-05", aluguel);
    // Setembro/2026: fatura 9.000 (orcado 10.000 -> receita abaixo, estoura)
    await faturar("9000.00", "2026-09-08", mensalidades);
    // Agosto/2026: dentro do orcado nos dois
    await gastar("4000.00", "2026-08-05", aluguel);
    await faturar("10000.00", "2026-08-08", mensalidades);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM itens_orcamento WHERE orcamento_id IN (SELECT id FROM orcamentos WHERE empresa_id = ${cenario.empresaId})`);
    await banco.execute(sql`DELETE FROM orcamentos WHERE empresa_id = ${cenario.empresaId}`);
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

  // ------------------------------------------------------- mesma fonte

  it("MESMA FONTE: o realizado do orcamento e o mesmo de /resultados, categoria a categoria", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);

    for (const regime of ["caixa", "competencia"] as const) {
      const acompanhamento = await orcamento.acompanhar(escopo, ANO, 9, regime, HOJE);
      const resultado = await dre.montar(
        escopo,
        { de: criarDataCivil(ANO, 9, 1), ate: criarDataCivil(ANO, 9, 30), regime },
        HOJE,
      );

      for (const grupo of acompanhamento.grupos) {
        for (const linha of grupo.linhas) {
          const noDre = resultado.linhas
            .flatMap((l) => l.categorias)
            .find((categoria) => categoria.categoriaNome === linha.categoriaNome);
          expect(linha.noMes.realizado.paraTexto(), `${regime} · ${linha.categoriaNome}`).toBe(
            (noDre?.total ?? Dinheiro.zero()).paraTexto(),
          );
        }
      }
    }
  });

  // ------------------------------------------------------- planejamento

  it("grava e le a grade de doze meses", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);

    const planejado = await orcamento.planejamento(escopo, ANO);
    const linha = planejado.linhas.find((l) => l.categoriaId === aluguel)!;
    expect(linha.porMes).toHaveLength(12);
    expect(linha.total.paraTexto()).toBe("48000.00");
    expect(planejado.orcamentoId).not.toBeNull();
  });

  it("distribuir um total anual fecha exatamente com o total", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(mensalidades, distribuirNoAno(Dinheiro.deTexto("120000.00"))), usuarioId);
    const planejado = await orcamento.planejamento(escopo, ANO);
    expect(planejado.linhas.find((l) => l.categoriaId === mensalidades)?.total.paraTexto()).toBe("120000.00");
  });

  it("celula zerada e APAGADA: 'nao orcado' e diferente de 'orcado em zero'", async () => {
    const comZeros = grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))).map((valor, indice) =>
      indice === 2 ? { ...valor, valor: Dinheiro.zero() } : valor,
    );
    await orcamento.salvarPlanejamento(escopo, ANO, comZeros, usuarioId);

    const [total] = await banco.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM itens_orcamento i
      JOIN orcamentos o ON o.id = i.orcamento_id
      WHERE o.empresa_id = ${cenario.empresaId} AND i.categoria_id = ${aluguel}
    `);
    expect(Number(total?.total)).toBe(11);

    const acompanhamento = await orcamento.acompanhar(escopo, ANO, 3, "caixa", HOJE);
    const marco = acompanhamento.grupos.flatMap((g) => g.linhas).find((l) => l.categoriaId === aluguel)!;
    expect(marco.noMes.planejado.ehZero()).toBe(true);
    expect(marco.noMes.estourou).toBe(false);
  });

  it("salvar de novo reescreve a grade inteira, sem sobrar linha antiga", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("5000.00"))), usuarioId);

    const planejado = await orcamento.planejamento(escopo, ANO);
    expect(planejado.linhas.find((l) => l.categoriaId === aluguel)?.total.paraTexto()).toBe("60000.00");
  });

  it("a alteracao fica na auditoria", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);
    const [evento] = await banco.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM eventos_auditoria
      WHERE empresa_id = ${cenario.empresaId} AND acao = 'orcamento.planejado'
    `);
    expect(Number(evento?.total)).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------ estouro

  it("DESPESA acima do orcado estoura; RECEITA abaixo do orcado tambem", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, [
      ...grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))),
      ...grade(mensalidades, repetirNosDozeMeses(Dinheiro.deTexto("10000.00"))),
    ], usuarioId);

    const setembro = await orcamento.acompanhar(escopo, ANO, 9, "caixa", HOJE);
    const linhas = setembro.grupos.flatMap((g) => g.linhas);

    const despesa = linhas.find((l) => l.categoriaId === aluguel)!;
    expect(despesa.noMes.realizado.paraTexto()).toBe("4200.00");
    expect(despesa.noMes.diferenca.paraTexto()).toBe("200.00");
    expect(despesa.noMes.estourou).toBe(true);

    const receita = linhas.find((l) => l.categoriaId === mensalidades)!;
    expect(receita.noMes.realizado.paraTexto()).toBe("9000.00");
    expect(receita.noMes.diferenca.paraTexto()).toBe("-1000.00");
    expect(receita.noMes.estourou).toBe(true);

    expect(setembro.estouros).toHaveLength(2);
    // Ordenados pela diferenca absoluta: a receita (1.000) vem antes.
    expect(setembro.estouros[0]?.categoriaId).toBe(mensalidades);
  });

  it("mes dentro do orcado NAO estoura", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, [
      ...grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))),
      ...grade(mensalidades, repetirNosDozeMeses(Dinheiro.deTexto("10000.00"))),
    ], usuarioId);

    const agosto = await orcamento.acompanhar(escopo, ANO, 8, "caixa", HOJE);
    expect(agosto.estouros).toHaveLength(0);
  });

  it("o acumulado soma de janeiro ate o mes escolhido", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);
    const setembro = await orcamento.acompanhar(escopo, ANO, 9, "caixa", HOJE);
    const linha = setembro.grupos.flatMap((g) => g.linhas).find((l) => l.categoriaId === aluguel)!;

    expect(linha.acumulado.planejado.paraTexto()).toBe("36000.00"); // 9 x 4.000
    expect(linha.acumulado.realizado.paraTexto()).toBe("8200.00"); // 4.000 (ago) + 4.200 (set)
    expect(linha.acumulado.execucao).toBeCloseTo(22.78, 1);
  });

  it("os totais por grupo somam as linhas do grupo", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, [
      ...grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))),
      ...grade(mensalidades, repetirNosDozeMeses(Dinheiro.deTexto("10000.00"))),
    ], usuarioId);

    const setembro = await orcamento.acompanhar(escopo, ANO, 9, "caixa", HOJE);
    expect(setembro.receitaNoMes.realizado.paraTexto()).toBe("9000.00");
    expect(setembro.despesaNoMes.realizado.paraTexto()).toBe("4200.00");
    expect(setembro.receitaNoMes.planejado.paraTexto()).toBe("10000.00");
    expect(setembro.despesaNoMes.planejado.paraTexto()).toBe("4000.00");
  });

  // --------------------------------------------------- bases de preenchimento

  it("copiar do ano anterior traz a grade gravada", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);
    const base = await orcamento.planejadoDoAnoAnterior(escopo, ANO + 1);

    expect(base).toHaveLength(12);
    expect(base.every((valor) => valor.categoriaId === aluguel && valor.valor.paraTexto() === "4000.00")).toBe(true);
  });

  it("basear no realizado do ano anterior traz o que de fato aconteceu", async () => {
    const base = await orcamento.realizadoDoAnoAnterior(escopo, ANO + 1, "caixa", HOJE);
    const doAluguel = base.filter((valor) => valor.categoriaId === aluguel);

    // Agosto 4.000 e setembro 4.200.
    expect(doAluguel.map((v) => [v.mes, v.valor.paraTexto()]).sort()).toEqual([
      [8, "4000.00"],
      [9, "4200.00"],
    ]);
  });

  it("ano sem planejamento devolve grade zerada e avisa", async () => {
    const vazio = await orcamento.acompanhar(escopo, 2024, 6, "caixa", HOJE);
    expect(vazio.temPlanejamento).toBe(false);
    expect(vazio.estouros).toHaveLength(0);
    expect(vazio.despesaNoMes.planejado.ehZero()).toBe(true);
  });

  // -------------------------------------------------------- isolamento

  it("ISOLAMENTO: o orcamento de uma empresa nao enxerga o da outra", async () => {
    await orcamento.salvarPlanejamento(escopo, ANO, grade(aluguel, repetirNosDozeMeses(Dinheiro.deTexto("4000.00"))), usuarioId);

    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };

      const planejado = await orcamento.planejamento(escopoOutra, ANO);
      expect(planejado.total.ehZero()).toBe(true);
      expect(planejado.orcamentoId).toBeNull();
      expect(planejado.linhas.every((linha) => linha.categoriaId !== aluguel)).toBe(true);

      const acompanhamento = await orcamento.acompanhar(escopoOutra, ANO, 9, "caixa", HOJE);
      expect(acompanhamento.temPlanejamento).toBe(false);
      expect(acompanhamento.despesaNoMes.realizado.ehZero()).toBe(true);
    } finally {
      await banco.execute(sql`DELETE FROM itens_orcamento WHERE orcamento_id IN (SELECT id FROM orcamentos WHERE empresa_id = ${outra.empresaId})`);
      await banco.execute(sql`DELETE FROM orcamentos WHERE empresa_id = ${outra.empresaId}`);
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${outra.empresaId}`).catch(() => undefined);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
