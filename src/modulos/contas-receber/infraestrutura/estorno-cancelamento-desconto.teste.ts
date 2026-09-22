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
 * As correcoes do Gate 5.1 contra PostgreSQL real: estorno, cancelamento e
 * desconto.
 *
 * O que estes testes protegem e uma promessa so: DINHEIRO NAO SOME NEM E
 * APAGADO. Corrigir um lancamento errado tem de deixar duas linhas no
 * historico — a errada e o conserto — porque e isso que bate com o extrato do
 * banco de verdade, onde o dinheiro entrou e voltou.
 */
describe.skipIf(!urlBancoTeste)("estorno, cancelamento e desconto (PostgreSQL real)", () => {
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

  function recebimentoDe(principal: string, extras: Partial<{ juros: string; multa: string; desconto: string; forma: string }> = {}) {
    return {
      contaBancariaId: cenario.contaBancariaId,
      dataRecebimento: HOJE,
      valorPrincipal: Dinheiro.deTexto(principal),
      valorJuros: Dinheiro.deTexto(extras.juros ?? "0.00"),
      valorMulta: Dinheiro.deTexto(extras.multa ?? "0.00"),
      valorDesconto: Dinheiro.deTexto(extras.desconto ?? "0.00"),
      formaPagamento: extras.forma ?? "pix",
      usuarioId,
    };
  }

  const estorno = (motivo = "Lancado em duplicidade") => ({ motivo, dataEstorno: HOJE, usuarioId });

  async function saldoDaContaBancaria(): Promise<string> {
    const [linha] = await banco.execute<{ saldo: string }>(sql`
      SELECT (c.saldo_inicial + COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END), 0))::text AS saldo
      FROM contas_bancarias c
      LEFT JOIN movimentacoes_bancarias m ON m.conta_bancaria_id = c.id
      WHERE c.id = ${cenario.contaBancariaId}
      GROUP BY c.saldo_inicial
    `);
    return linha?.saldo ?? "0";
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
      VALUES (${usuarioId}, 'Teste Correcoes CR', ${`cr-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM recebimentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_receber WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  // ---------------------------------------------------------------- estorno

  describe("estorno", () => {
    it("cria a movimentacao INVERSA e devolve o saldo da parcela", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("400.00"));

      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(paga?.saldo.paraTexto()).toBe("600.00");

      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno());

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.valorRecebido.paraTexto()).toBe("0.00");
      expect(depois?.saldo.paraTexto()).toBe("1000.00");
      expect(depois?.situacao).toBe("aberta");

      const [inversa] = await banco.execute<{ tipo: string; valor: string; origem: string; estornada: string | null }>(sql`
        SELECT tipo, valor, origem::text AS origem, movimentacao_estornada_id::text AS estornada
        FROM movimentacoes_bancarias
        WHERE empresa_id = ${cenario.empresaId} AND origem = 'estorno'
        ORDER BY criado_em DESC LIMIT 1
      `);
      expect(inversa?.tipo).toBe("saida");
      expect(inversa?.valor).toBe("400.00");
      expect(inversa?.estornada).not.toBeNull();
    });

    it("o recebimento estornado CONTINUA no historico, marcado", async () => {
      const conta = await novaConta("200.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("200.00"));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno("Cheque devolvido"));

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.recebimentos).toHaveLength(1);
      expect(depois?.recebimentos[0]?.estornado).toBe(true);
      expect(depois?.recebimentos[0]?.motivoEstorno).toBe("Cheque devolvido");
      expect(depois?.recebimentos[0]?.estornadoEm).not.toBeNull();
      expect(depois?.recebimentos[0]?.podeEstornar).toBe(false);
    });

    it("recusa estornar duas vezes o mesmo recebimento", async () => {
      const conta = await novaConta("300.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("300.00"));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      const recebimentoId = paga!.recebimentos[0]!.id;

      await repositorio.estornarRecebimento(escopo, recebimentoId, estorno());
      await expect(repositorio.estornarRecebimento(escopo, recebimentoId, estorno())).rejects.toThrow("PAGAMENTO_JA_ESTORNADO");
    });

    it("o saldo do banco volta ao que era: entrou e saiu", async () => {
      const antes = await saldoDaContaBancaria();
      const conta = await novaConta("777.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("777.00"));
      expect(await saldoDaContaBancaria()).toBe(Dinheiro.deTexto(antes).somar(Dinheiro.deTexto("777.00")).paraTexto());

      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno());
      expect(await saldoDaContaBancaria()).toBe(antes);
    });

    it("estornar juros e multa devolve ao banco o TOTAL que saiu, e a parcela so o principal", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("1000.00", { juros: "30.00", multa: "20.00" }));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(paga?.recebimentos[0]?.valorRecebido.paraTexto()).toBe("1050.00");

      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno());

      const [inversa] = await banco.execute<{ valor: string }>(sql`
        SELECT m.valor FROM movimentacoes_bancarias m
        JOIN recebimentos p ON p.movimentacao_estorno_id = m.id
        WHERE p.id = ${paga!.recebimentos[0]!.id}
      `);
      expect(inversa?.valor).toBe("1050.00");

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.saldo.paraTexto()).toBe("1000.00");
    });

    it("ATOMICIDADE: falha no meio do estorno nao deixa a movimentacao inversa sobrando", async () => {
      const conta = await novaConta("500.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("500.00"));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      const recebimentoId = paga!.recebimentos[0]!.id;

      const antes = await contarMovimentacoes();

      /*
       * A falha e provocada no ULTIMO passo da transacao: o registro de
       * auditoria, que grava `organizacao_id`. Com um valor que nao e UUID, o
       * PostgreSQL recusa a insercao depois que a movimentacao inversa, o
       * UPDATE do recebimento e o UPDATE da parcela ja aconteceram.
       *
       * E a versao mais exigente do teste: se a transacao nao fosse unica,
       * sobraria uma entrada no extrato sem estorno nenhum por tras, o saldo
       * do banco ficaria maior do que a realidade e a parcela voltaria a
       * aparecer em aberto sem o dinheiro ter voltado.
       *
       * `organizacaoId` so e usado pela auditoria — os filtros de isolamento
       * usam `empresaId`, que continua correto. Por isso tudo antes passa.
       */
      const escopoQuebrado = {
        ...escopo,
        organizacaoId: comoIdentificador<"Organizacao">("nao-e-um-uuid"),
      };
      await expect(repositorio.estornarRecebimento(escopoQuebrado, recebimentoId, estorno())).rejects.toThrow();

      expect(await contarMovimentacoes()).toBe(antes);

      const intacta = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(intacta?.valorRecebido.paraTexto()).toBe("500.00");
      expect(intacta?.recebimentos[0]?.estornado).toBe(false);
    });

    it("o estorno fica na trilha de auditoria, com o motivo", async () => {
      const conta = await novaConta("90.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("90.00"));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno("Cliente devolveu"));

      const [evento] = await banco.execute<{ total: number }>(sql`
        SELECT count(*)::int AS total FROM eventos_auditoria
        WHERE empresa_id = ${cenario.empresaId}
          AND acao = 'conta_receber.recebimento_estornado'
          AND dados_depois->>'motivo' = 'Cliente devolveu'
      `);
      expect(Number(evento?.total)).toBe(1);
    });

    it("recusa estornar baixa CONCILIADA — ponto de encontro com o Gate 6", async () => {
      const conta = await novaConta("111.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("111.00"));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);
      const recebimentoId = paga!.recebimentos[0]!.id;

      const [conciliacao] = await banco.execute<{ id: string }>(sql`
        INSERT INTO conciliacoes_bancarias (empresa_id, conta_bancaria_id, data_conciliacao, confianca, origem_decisao)
        VALUES (${cenario.empresaId}, ${cenario.contaBancariaId}, '2026-09-22', 'alta', 'manual')
        RETURNING id
      `);
      await banco.execute(sql`
        INSERT INTO conciliacoes_movimentacoes (conciliacao_id, movimentacao_id, ativo)
        SELECT ${conciliacao!.id}, movimentacao_bancaria_id, true FROM recebimentos WHERE id = ${recebimentoId}
      `);

      try {
        await expect(repositorio.estornarRecebimento(escopo, recebimentoId, estorno())).rejects.toThrow("BAIXA_CONCILIADA");

        const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
        expect(lida?.recebimentos[0]?.podeEstornar).toBe(false);
        expect(lida?.recebimentos[0]?.estornado).toBe(false);
      } finally {
        await banco.execute(sql`DELETE FROM conciliacoes_movimentacoes WHERE conciliacao_id = ${conciliacao!.id}`);
        await banco.execute(sql`DELETE FROM conciliacoes_bancarias WHERE id = ${conciliacao!.id}`);
      }
    });
  });

  // ----------------------------------------------------------- cancelamento

  describe("cancelamento", () => {
    it("conta SEM baixa: cancelamento total, saldo em aberto vai a zero", async () => {
      const conta = await novaConta("800.00");
      const antes = await repositorio.buscarPorId(escopo, conta, HOJE);

      await repositorio.cancelar(escopo, antes!.tituloId, { motivo: "Servico nao foi prestado", usuarioId });

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.situacao).toBe("cancelada");
      expect(depois?.tituloCancelado).toBe(true);
      expect(depois?.motivoCancelamento).toBe("Servico nao foi prestado");
      // O saldo EM ABERTO some (nada mais sera recebido)...
      expect(depois?.saldo.paraTexto()).toBe("0.00");
      // ...mas o quanto deixou de ser recebido continua visivel.
      expect(depois?.valorCancelado.paraTexto()).toBe("800.00");
    });

    it("conta com baixa PARCIAL: o recebido continua recebido, so o restante e cancelado", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("400.00"));
      const parcial = await repositorio.buscarPorId(escopo, conta, HOJE);

      await repositorio.cancelar(escopo, parcial!.tituloId, { motivo: "Acordo com o cliente", usuarioId });

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.situacao).toBe("cancelada");
      expect(depois?.valorRecebido.paraTexto()).toBe("400.00");
      expect(depois?.valorCancelado.paraTexto()).toBe("600.00");
      expect(depois?.recebimentos).toHaveLength(1);
      expect(depois?.recebimentos[0]?.estornado).toBe(false);
    });

    it("conta cancelada sai dos totais a receber da listagem", async () => {
      const conta = await novaConta("650.00", "2026-11-11");
      const antes = await repositorio.listar(escopo, { vencimentoDe: "2026-11-11" as DataVencimento }, { pagina: 1, tamanho: 50 }, HOJE);
      const somaAntes = Dinheiro.somarTodos(antes.itens.map((i) => i.saldo));
      expect(somaAntes.paraTexto()).toBe("650.00");

      const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.cancelar(escopo, lida!.tituloId, { motivo: "Pedido cancelado", usuarioId });

      const depois = await repositorio.listar(escopo, { vencimentoDe: "2026-11-11" as DataVencimento }, { pagina: 1, tamanho: 50 }, HOJE);
      expect(Dinheiro.somarTodos(depois.itens.map((i) => i.saldo)).paraTexto()).toBe("0.00");
      // Mas continua consultavel pelo filtro de situacao.
      const canceladas = await repositorio.listar(escopo, { situacoes: ["cancelada"] }, { pagina: 1, tamanho: 50 }, HOJE);
      expect(canceladas.itens.map((i) => i.parcelaId)).toContain(conta);
    });

    it("recusa cancelar a mesma conta duas vezes", async () => {
      const conta = await novaConta("120.00");
      const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.cancelar(escopo, lida!.tituloId, { motivo: "Duplicado", usuarioId });
      await expect(repositorio.cancelar(escopo, lida!.tituloId, { motivo: "De novo", usuarioId })).rejects.toThrow("CONTA_JA_CANCELADA");
    });

    it("conta cancelada nao aceita novo recebimento", async () => {
      const conta = await novaConta("140.00");
      const lida = await repositorio.buscarPorId(escopo, conta, HOJE);
      await repositorio.cancelar(escopo, lida!.tituloId, { motivo: "Nao vamos receber", usuarioId });
      await expect(repositorio.registrarRecebimento(escopo, conta, recebimentoDe("140.00"))).rejects.toThrow("PARCELA_NAO_ESTA_ABERTA");
    });

    it("cancelar parcelada cancela SO as parcelas em aberto", async () => {
      const { tituloId, parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Curso em 3x",
          clienteId: cenario.clienteId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2026-10-01"),
          valorTotal: Dinheiro.deTexto("300.00"),
          parcelas: [1, 2, 3].map((numero) => ({
            numero,
            dataVencimento: dataCivilDeTexto(`2026-${9 + numero}-10`) as DataVencimento,
            valor: Dinheiro.deTexto("100.00"),
          })),
        },
        usuarioId,
      );

      await repositorio.registrarRecebimento(escopo, parcelaId, recebimentoDe("100.00"));
      await repositorio.cancelar(escopo, tituloId, { motivo: "Desistencia", usuarioId });

      const detalhe = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      const situacoes = detalhe!.parcelas.map((p) => p.situacao);
      expect(situacoes).toEqual(["liquidada", "cancelada", "cancelada"]);
    });
  });

  // --------------------------------------------------------------- desconto

  describe("desconto na quitacao", () => {
    it("o exemplo do enunciado: R$ 1.000 quitada com R$ 950 e R$ 50 de desconto", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("950.00", { desconto: "50.00" }));

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.situacao).toBe("liquidada");
      expect(depois?.saldo.paraTexto()).toBe("0.00");

      const baixa = depois!.recebimentos[0]!;
      // O que saiu do banco.
      expect(baixa.valorRecebido.paraTexto()).toBe("950.00");
      // O que abateu da conta.
      expect(baixa.valorAbatido.paraTexto()).toBe("1000.00");
      // A parte em dinheiro e o desconto, guardados SEPARADAMENTE.
      expect(baixa.valorPrincipal.paraTexto()).toBe("950.00");
      expect(baixa.valorDesconto.paraTexto()).toBe("50.00");
    });

    it("o que sai do banco e o que abate o saldo sao valores diferentes", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("950.00", { desconto: "50.00" }));

      const [mov] = await banco.execute<{ valor: string }>(sql`
        SELECT m.valor FROM movimentacoes_bancarias m
        JOIN recebimentos p ON p.movimentacao_bancaria_id = m.id
        WHERE p.parcela_receber_id = ${conta}
      `);
      expect(mov?.valor).toBe("950.00");

      const [parcela] = await banco.execute<{ valor_recebido: string }>(
        sql`SELECT valor_recebido FROM parcelas_receber WHERE id = ${conta}`,
      );
      expect(parcela?.valor_recebido).toBe("1000.00");
    });

    it("juros, multa e desconto convivem e cada um fica na sua coluna", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("900.00", { juros: "30.00", multa: "20.00", desconto: "100.00" }));

      const [linha] = await banco.execute<{
        valor_principal: string; valor_juros: string; valor_multa: string; valor_desconto: string; valor_recebido: string;
      }>(sql`SELECT valor_principal, valor_juros, valor_multa, valor_desconto, valor_recebido FROM recebimentos WHERE parcela_receber_id = ${conta}`);

      // `valor_principal` guarda o ABATIMENTO (900 + 100 de desconto).
      expect(linha?.valor_principal).toBe("1000.00");
      expect(linha?.valor_juros).toBe("30.00");
      expect(linha?.valor_multa).toBe("20.00");
      expect(linha?.valor_desconto).toBe("100.00");
      // E o CHECK do banco fecha: 1000 + 30 + 20 - 100 = 950 (o que saiu).
      expect(linha?.valor_recebido).toBe("950.00");

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.situacao).toBe("liquidada");
    });

    it("recusa quando principal mais desconto passam do saldo", async () => {
      const conta = await novaConta("1000.00");
      await expect(
        repositorio.registrarRecebimento(escopo, conta, recebimentoDe("950.00", { desconto: "100.00" })),
      ).rejects.toThrow("VALOR_ACIMA_DO_SALDO");
    });

    it("estornar uma baixa com desconto devolve o ABATIMENTO cheio ao saldo", async () => {
      const conta = await novaConta("1000.00");
      await repositorio.registrarRecebimento(escopo, conta, recebimentoDe("950.00", { desconto: "50.00" }));
      const paga = await repositorio.buscarPorId(escopo, conta, HOJE);

      await repositorio.estornarRecebimento(escopo, paga!.recebimentos[0]!.id, estorno("Desconto nao foi acordado"));

      const depois = await repositorio.buscarPorId(escopo, conta, HOJE);
      expect(depois?.saldo.paraTexto()).toBe("1000.00");
      expect(depois?.situacao).toBe("aberta");
    });
  });
});
