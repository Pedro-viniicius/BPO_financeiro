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
 * Transferencia entre contas proprias, contra PostgreSQL real.
 *
 * A promessa aqui e uma so: o dinheiro nao pode sumir nem nascer no meio do
 * caminho. Ou as DUAS movimentacoes entram, ou nenhuma entra.
 */
describe.skipIf(!urlBancoTeste)("transferencia entre contas (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasBancariasDrizzle(banco as never);
  const PAGINA = { pagina: 1, tamanho: 50 };

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  const usuarioId = crypto.randomUUID();

  const transferencia = (valor: string, extras: Partial<{ origem: string; destino: string; data: string }> = {}) => ({
    contaOrigemId: extras.origem ?? cenario.contaBancariaId,
    contaDestinoId: extras.destino ?? cenario.contaCaixaId,
    data: dataCivilDeTexto(extras.data ?? "2026-09-20"),
    valor: Dinheiro.deTexto(valor),
    usuarioId,
  });

  const contarMovimentacoes = async (): Promise<number> => {
    const [linha] = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM movimentacoes_bancarias WHERE empresa_id = ${cenario.empresaId}`,
    );
    return Number(linha?.total ?? 0);
  };

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM transferencias WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await cliente.end();
  });

  it("gera DUAS movimentacoes vinculadas, uma em cada conta", async () => {
    const antes = await contarMovimentacoes();
    const { transferenciaId } = await repositorio.criarTransferencia(escopo, transferencia("300.00"));

    expect(await contarMovimentacoes()).toBe(antes + 2);

    const [linha] = await banco.execute<{ saida_conta: string; entrada_conta: string; tipo_saida: string; tipo_entrada: string; origem: string }>(sql`
      SELECT s.conta_bancaria_id::text AS saida_conta, e.conta_bancaria_id::text AS entrada_conta,
             s.tipo AS tipo_saida, e.tipo AS tipo_entrada, s.origem::text AS origem
      FROM transferencias t
      JOIN movimentacoes_bancarias s ON s.id = t.movimentacao_saida_id
      JOIN movimentacoes_bancarias e ON e.id = t.movimentacao_entrada_id
      WHERE t.id = ${transferenciaId}
    `);
    expect(linha?.saida_conta).toBe(cenario.contaBancariaId);
    expect(linha?.entrada_conta).toBe(cenario.contaCaixaId);
    expect(linha?.tipo_saida).toBe("saida");
    expect(linha?.tipo_entrada).toBe("entrada");
    expect(linha?.origem).toBe("transferencia");
  });

  it("o saldo sai de uma conta e entra na outra; o total nao muda", async () => {
    const saldoDe = async (id: string) => (await repositorio.buscarPorId(escopo, id))!.saldoAtual;
    const origemAntes = await saldoDe(cenario.contaBancariaId);
    const destinoAntes = await saldoDe(cenario.contaCaixaId);

    await repositorio.criarTransferencia(escopo, transferencia("150.00"));

    const origemDepois = await saldoDe(cenario.contaBancariaId);
    const destinoDepois = await saldoDe(cenario.contaCaixaId);

    expect(origemDepois.paraTexto()).toBe(origemAntes.subtrair(Dinheiro.deTexto("150.00")).paraTexto());
    expect(destinoDepois.paraTexto()).toBe(destinoAntes.somar(Dinheiro.deTexto("150.00")).paraTexto());
    expect(origemDepois.somar(destinoDepois).paraTexto()).toBe(origemAntes.somar(destinoAntes).paraTexto());
  });

  it("NAO e receita nem despesa: sem categoria e com origem propria", async () => {
    const { transferenciaId } = await repositorio.criarTransferencia(escopo, transferencia("10.00"));
    const linhas = await banco.execute<{ categoria: string | null; origem: string }>(sql`
      SELECT m.categoria_id::text AS categoria, m.origem::text AS origem
      FROM transferencias t
      JOIN movimentacoes_bancarias m ON m.id IN (t.movimentacao_saida_id, t.movimentacao_entrada_id)
      WHERE t.id = ${transferenciaId}
    `);
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.categoria === null)).toBe(true);
    expect(linhas.every((l) => l.origem === "transferencia")).toBe(true);
  });

  it("recusa transferir para a mesma conta", async () => {
    await expect(
      repositorio.criarTransferencia(escopo, transferencia("50.00", { destino: cenario.contaBancariaId })),
    ).rejects.toThrow("CONTAS_IGUAIS");
  });

  it("recusa valor zero ou negativo", async () => {
    await expect(repositorio.criarTransferencia(escopo, transferencia("0.00"))).rejects.toThrow("VALOR_INVALIDO");
    await expect(repositorio.criarTransferencia(escopo, transferencia("-5.00"))).rejects.toThrow("VALOR_INVALIDO");
  });

  it("ISOLAMENTO: nao transfere usando conta de outra empresa, nem como origem nem como destino", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      await expect(
        repositorio.criarTransferencia(escopo, transferencia("20.00", { destino: outra.contaBancariaId })),
      ).rejects.toThrow("CONTA_BANCARIA_NAO_ENCONTRADA");
      await expect(
        repositorio.criarTransferencia(escopo, transferencia("20.00", { origem: outra.contaBancariaId })),
      ).rejects.toThrow("CONTA_BANCARIA_NAO_ENCONTRADA");
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("ATOMICIDADE: falha no meio nao deixa uma movimentacao solta", async () => {
    const antes = await contarMovimentacoes();
    /*
     * A falha e provocada no ULTIMO passo (auditoria, que grava
     * `organizacao_id`). As duas movimentacoes e a transferencia ja entraram
     * quando ela acontece: se a transacao nao fosse unica, sobrariam uma
     * saida e uma entrada sem transferencia por tras.
     */
    const escopoQuebrado = { ...escopo, organizacaoId: comoIdentificador<"Organizacao">("nao-e-um-uuid") };
    await expect(repositorio.criarTransferencia(escopoQuebrado, transferencia("999.00"))).rejects.toThrow();

    expect(await contarMovimentacoes()).toBe(antes);
    const [total] = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM transferencias WHERE empresa_id = ${cenario.empresaId} AND valor = '999.00'`,
    );
    expect(Number(total?.total)).toBe(0);
  });

  it("estorno devolve o dinheiro nas DUAS contas", async () => {
    const saldoDe = async (id: string) => (await repositorio.buscarPorId(escopo, id))!.saldoAtual.paraTexto();
    const origemAntes = await saldoDe(cenario.contaBancariaId);
    const destinoAntes = await saldoDe(cenario.contaCaixaId);

    const { transferenciaId } = await repositorio.criarTransferencia(escopo, transferencia("80.00"));
    expect(await saldoDe(cenario.contaBancariaId)).not.toBe(origemAntes);

    await repositorio.estornarTransferencia(escopo, transferenciaId, {
      motivo: "Transferencia feita na conta errada",
      dataEstorno: dataCivilDeTexto("2026-09-21"),
      usuarioId,
    });

    expect(await saldoDe(cenario.contaBancariaId)).toBe(origemAntes);
    expect(await saldoDe(cenario.contaCaixaId)).toBe(destinoAntes);
  });

  it("o estorno cria DUAS movimentacoes inversas, vinculadas as originais", async () => {
    const { transferenciaId } = await repositorio.criarTransferencia(escopo, transferencia("60.00"));
    await repositorio.estornarTransferencia(escopo, transferenciaId, {
      motivo: "Valor errado",
      dataEstorno: dataCivilDeTexto("2026-09-21"),
      usuarioId,
    });

    const inversas = await banco.execute<{ tipo: string; origem: string; conta: string }>(sql`
      SELECT e.tipo, e.origem::text AS origem, e.conta_bancaria_id::text AS conta
      FROM transferencias t
      JOIN movimentacoes_bancarias e
        ON e.movimentacao_estornada_id IN (t.movimentacao_saida_id, t.movimentacao_entrada_id)
      WHERE t.id = ${transferenciaId}
      ORDER BY e.tipo
    `);
    expect(inversas).toHaveLength(2);
    expect(inversas.map((i) => i.tipo)).toEqual(["entrada", "saida"]);
    expect(inversas.every((i) => i.origem === "estorno")).toBe(true);
  });

  it("recusa estornar a mesma transferencia duas vezes", async () => {
    const { transferenciaId } = await repositorio.criarTransferencia(escopo, transferencia("40.00"));
    const estorno = { motivo: "Duplicada", dataEstorno: dataCivilDeTexto("2026-09-21"), usuarioId };

    await repositorio.estornarTransferencia(escopo, transferenciaId, estorno);
    await expect(repositorio.estornarTransferencia(escopo, transferenciaId, estorno)).rejects.toThrow(
      "TRANSFERENCIA_JA_ESTORNADA",
    );
  });

  it("a lista mostra origem, destino e se ja foi estornada", async () => {
    const pagina = await repositorio.listarTransferencias(escopo, PAGINA);
    expect(pagina.total).toBeGreaterThan(0);
    const primeira = pagina.itens[0]!;
    expect(primeira.contaOrigemNome).toBeTruthy();
    expect(primeira.contaDestinoNome).toBeTruthy();
    expect(pagina.itens.some((t) => t.estornada)).toBe(true);
    expect(pagina.itens.filter((t) => t.estornada).every((t) => !t.podeEstornar)).toBe(true);
  });

  it("ISOLAMENTO: a lista de outra empresa nao aparece", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      expect((await repositorio.listarTransferencias(escopoOutra, PAGINA)).total).toBe(0);

      const minhas = await repositorio.listarTransferencias(escopo, PAGINA);
      await expect(
        repositorio.estornarTransferencia(escopoOutra, minhas.itens[0]!.id, {
          motivo: "Tentativa de outra empresa",
          dataEstorno: dataCivilDeTexto("2026-09-21"),
          usuarioId,
        }),
      ).rejects.toThrow("TRANSFERENCIA_NAO_ENCONTRADA");
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
