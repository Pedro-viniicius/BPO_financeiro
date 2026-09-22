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

import { RepositorioContasBancariasDrizzle } from "./repositorio-contas-bancarias-drizzle";

/**
 * Ajuste de saldo e extrato, contra PostgreSQL real.
 *
 * A regra que estes testes protegem: o saldo inicial e a BASE de todo o
 * historico. Enquanto nao houver movimentacao, corrigi-lo e inofensivo. Depois
 * da primeira, mexer nele recalcularia em silencio meses ja conferidos — e a
 * correcao passa a ser um lancamento visivel, com data e motivo.
 */
describe.skipIf(!urlBancoTeste)("ajuste de saldo e extrato (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasBancariasDrizzle(banco as never);

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  const usuarioId = crypto.randomUUID();
  const PAGINA = { pagina: 1, tamanho: 50 };

  async function contaNova(nome: string, saldoInicial = "100.00"): Promise<string> {
    const { contaId } = await repositorio.criar(escopo, {
      nome: `${nome} ${crypto.randomUUID().slice(0, 6)}`,
      tipo: "conta_corrente",
      instituicaoBancariaId: cenario.instituicaoId,
      saldoInicial: Dinheiro.deTexto(saldoInicial),
      dataSaldoInicial: dataCivilDeTexto("2026-01-01"),
    });
    return contaId;
  }

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await cliente.end();
  });

  describe("saldo inicial", () => {
    it("conta SEM movimentacao: o saldo inicial pode ser corrigido direto", async () => {
      const contaId = await contaNova("Corrigivel");
      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoInicialEditavel).toBe(true);

      await repositorio.editar(escopo, contaId, {
        nome: "Corrigida",
        tipo: "conta_corrente",
        instituicaoBancariaId: cenario.instituicaoId,
        saldoInicial: Dinheiro.deTexto("250.00"),
        dataSaldoInicial: dataCivilDeTexto("2026-02-01"),
      });

      const depois = await repositorio.buscarPorId(escopo, contaId);
      expect(depois?.saldoInicial.paraTexto()).toBe("250.00");
      expect(depois?.dataSaldoInicial).toBe("2026-02-01");
      expect(depois?.saldoAtual.paraTexto()).toBe("250.00");
    });

    it("COM movimentacao: o saldo inicial trava", async () => {
      const contaId = await contaNova("Travada");
      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "entrada",
        valor: Dinheiro.deTexto("10.00"),
        data: dataCivilDeTexto("2026-03-01"),
        motivo: "Rendimento nao lancado",
        usuarioId,
      });

      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoInicialEditavel).toBe(false);

      await expect(
        repositorio.editar(escopo, contaId, {
          nome: "Travada",
          tipo: "conta_corrente",
          instituicaoBancariaId: cenario.instituicaoId,
          saldoInicial: Dinheiro.deTexto("999.00"),
          dataSaldoInicial: dataCivilDeTexto("2026-01-01"),
        }),
      ).rejects.toThrow("SALDO_INICIAL_BLOQUEADO");

      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoInicial.paraTexto()).toBe("100.00");
    });

    it("COM movimentacao: o resto do cadastro continua editavel", async () => {
      const contaId = await contaNova("Renomeavel");
      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "saida",
        valor: Dinheiro.deTexto("5.00"),
        data: dataCivilDeTexto("2026-03-01"),
        motivo: "Tarifa bancaria",
        usuarioId,
      });

      await repositorio.editar(escopo, contaId, {
        nome: "Nome novo",
        tipo: "conta_poupanca",
        instituicaoBancariaId: cenario.instituicaoId,
        agencia: "1234",
      });

      const depois = await repositorio.buscarPorId(escopo, contaId);
      expect(depois?.nome).toBe("Nome novo");
      expect(depois?.tipo).toBe("conta_poupanca");
      expect(depois?.agencia).toBe("1234");
      expect(depois?.saldoInicial.paraTexto()).toBe("100.00");
    });
  });

  describe("lancamento de ajuste", () => {
    it("ajuste de entrada aumenta o saldo; de saida, diminui", async () => {
      const contaId = await contaNova("Ajustavel", "1000.00");

      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "entrada",
        valor: Dinheiro.deTexto("150.00"),
        data: dataCivilDeTexto("2026-03-10"),
        motivo: "Deposito nao lancado",
        usuarioId,
      });
      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoAtual.paraTexto()).toBe("1150.00");

      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "saida",
        valor: Dinheiro.deTexto("50.00"),
        data: dataCivilDeTexto("2026-03-11"),
        motivo: "Tarifa de manutencao",
        usuarioId,
      });
      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoAtual.paraTexto()).toBe("1100.00");
    });

    it("o ajuste aparece no extrato, identificado e com o motivo", async () => {
      const contaId = await contaNova("Com extrato", "500.00");
      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "entrada",
        valor: Dinheiro.deTexto("25.00"),
        data: dataCivilDeTexto("2026-04-01"),
        motivo: "Estorno de tarifa pelo banco",
        usuarioId,
      });

      const extrato = await repositorio.extrato(escopo, contaId, PAGINA);
      expect(extrato.total).toBe(1);
      expect(extrato.itens[0]?.descricao).toBe("Ajuste de saldo");
      expect(extrato.itens[0]?.origem).toBe("ajuste_manual");
      expect(extrato.itens[0]?.observacoes).toBe("Estorno de tarifa pelo banco");
      expect(extrato.itens[0]?.saldoAcumulado.paraTexto()).toBe("525.00");
    });

    it("a categoria do ajuste fica FORA da DRE (grupo transferencia)", async () => {
      const contaId = await contaNova("Classificada", "0.00");
      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "entrada",
        valor: Dinheiro.deTexto("7.00"),
        data: dataCivilDeTexto("2026-04-02"),
        motivo: "Diferenca de centavos",
        usuarioId,
      });

      const [linha] = await banco.execute<{ grupo: string; categoria: string }>(sql`
        SELECT cp.grupo_dre::text AS grupo, cf.nome AS categoria
        FROM movimentacoes_bancarias m
        JOIN categorias_financeiras cf ON cf.id = m.categoria_id
        JOIN contas_plano cp ON cp.id = cf.conta_plano_id
        WHERE m.conta_bancaria_id = ${contaId} AND m.origem = 'ajuste_manual'
      `);
      expect(linha?.categoria).toBe("Ajuste de saldo");
      expect(linha?.grupo).toBe("transferencia");
    });

    it("recusa ajuste sem valor, sem motivo, ou de outra empresa", async () => {
      const contaId = await contaNova("Recusa", "0.00");
      const base = { tipo: "entrada" as const, data: dataCivilDeTexto("2026-04-03"), motivo: "Motivo valido", usuarioId };

      await expect(repositorio.registrarAjuste(escopo, contaId, { ...base, valor: Dinheiro.zero() })).rejects.toThrow("VALOR_INVALIDO");
      await expect(
        repositorio.registrarAjuste(escopo, contaId, { ...base, valor: Dinheiro.deTexto("10.00"), motivo: "   " }),
      ).rejects.toThrow("MOTIVO_OBRIGATORIO");

      const outra = await criarCenarioBase(banco as BancoTeste);
      try {
        await expect(
          repositorio.registrarAjuste(escopo, outra.contaBancariaId, { ...base, valor: Dinheiro.deTexto("10.00") }),
        ).rejects.toThrow("CONTA_BANCARIA_NAO_ENCONTRADA");
      } finally {
        await apagarCenarioBase(banco as BancoTeste, outra);
      }
    });

    it("o ajuste fica na trilha de auditoria, com o motivo", async () => {
      const contaId = await contaNova("Auditada", "0.00");
      await repositorio.registrarAjuste(escopo, contaId, {
        tipo: "saida",
        valor: Dinheiro.deTexto("3.00"),
        data: dataCivilDeTexto("2026-04-04"),
        motivo: "IOF nao lancado",
        usuarioId,
      });

      const [evento] = await banco.execute<{ total: number }>(sql`
        SELECT count(*)::int AS total FROM eventos_auditoria
        WHERE empresa_id = ${cenario.empresaId}
          AND acao = 'conta_bancaria.saldo_ajustado'
          AND entidade_id = ${contaId}
          AND dados_depois->>'motivo' = 'IOF nao lancado'
      `);
      expect(Number(evento?.total)).toBe(1);
    });
  });

  describe("extrato", () => {
    it("o saldo acumulado anda linha a linha, em ordem de data", async () => {
      const contaId = await contaNova("Extrato ordenado", "100.00");
      for (const [dia, tipo, valor] of [
        ["2026-05-01", "entrada", "50.00"],
        ["2026-05-02", "saida", "30.00"],
        ["2026-05-03", "entrada", "80.00"],
      ] as const) {
        await repositorio.registrarAjuste(escopo, contaId, {
          tipo,
          valor: Dinheiro.deTexto(valor),
          data: dataCivilDeTexto(dia),
          motivo: `Lancamento de ${dia}`,
          usuarioId,
        });
      }

      const extrato = await repositorio.extrato(escopo, contaId, PAGINA);
      expect(extrato.itens.map((l) => l.data)).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
      expect(extrato.itens.map((l) => l.saldoAcumulado.paraTexto())).toEqual(["150.00", "120.00", "200.00"]);
      // A ultima linha bate com o saldo atual da conta.
      expect((await repositorio.buscarPorId(escopo, contaId))?.saldoAtual.paraTexto()).toBe("200.00");
    });

    it("o saldo acumulado NAO reinicia na pagina 2", async () => {
      const contaId = await contaNova("Extrato paginado", "0.00");
      for (let i = 1; i <= 7; i++) {
        await repositorio.registrarAjuste(escopo, contaId, {
          tipo: "entrada",
          valor: Dinheiro.deTexto("10.00"),
          data: dataCivilDeTexto(`2026-06-0${i}`),
          motivo: `Lancamento ${i}`,
          usuarioId,
        });
      }

      const primeira = await repositorio.extrato(escopo, contaId, { pagina: 1, tamanho: 3 });
      const segunda = await repositorio.extrato(escopo, contaId, { pagina: 2, tamanho: 3 });

      expect(primeira.total).toBe(7);
      expect(primeira.itens.map((l) => l.saldoAcumulado.paraTexto())).toEqual(["10.00", "20.00", "30.00"]);
      // Se o saldo fosse somado na tela, a pagina 2 comecaria do zero.
      expect(segunda.itens.map((l) => l.saldoAcumulado.paraTexto())).toEqual(["40.00", "50.00", "60.00"]);
    });

    it("o extrato de outra empresa vem vazio, mesmo sabendo o UUID", async () => {
      const outra = await criarCenarioBase(banco as BancoTeste);
      try {
        const extrato = await repositorio.extrato(escopo, outra.contaBancariaId, PAGINA);
        expect(extrato.itens).toHaveLength(0);
        expect(extrato.total).toBe(0);
      } finally {
        await apagarCenarioBase(banco as BancoTeste, outra);
      }
    });
  });
});
