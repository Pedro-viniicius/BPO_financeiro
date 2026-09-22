import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto, hojeDataCivil, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { gerarParcelas } from "@/compartilhado/financeiro/indice";
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
 * Parcelamento, travas de edicao, paginacao real e fuso horario, contra
 * PostgreSQL de verdade.
 *
 * Os quatro assuntos vivem no mesmo arquivo porque compartilham o mesmo
 * cenario caro de montar (uma empresa com centenas de parcelas). O que eles
 * tem em comum e serem erros que so aparecem com volume ou com o relogio
 * andando — exatamente os que passam despercebidos num teste pequeno.
 */
describe.skipIf(!urlBancoTeste)("parcelamento, edicao e listagem (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioContasPagarDrizzle(banco as never);
  const HOJE = dataCivilDeTexto("2026-09-22");

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  async function novaConta(valor: string, vencimento = "2026-10-05") {
    return repositorio.criar(
      escopo,
      {
        descricao: `Conta de ${valor}`,
        fornecedorId: cenario.fornecedorId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-10-01"),
        valorTotal: Dinheiro.deTexto(valor),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto(vencimento) as DataVencimento, valor: Dinheiro.deTexto(valor) }],
      },
      usuarioId,
    );
  }

  function pagamentoDe(valor: string) {
    return {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: HOJE,
      valorPrincipal: Dinheiro.deTexto(valor),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    };
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
      VALUES (${usuarioId}, 'Teste Listagem', ${`li-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM pagamentos WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  // ----------------------------------------------------------- parcelamento

  describe("parcelamento", () => {
    it("grava as parcelas com a soma exata do total, com a sobra na ultima", async () => {
      const parcelas = gerarParcelas({
        quantidade: 3,
        total: Dinheiro.deTexto("1000.00"),
        primeiroVencimento: dataCivilDeTexto("2026-10-10") as DataVencimento,
        periodicidade: "mensal",
      });

      const { tituloId, parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Notebook em 3x",
          fornecedorId: cenario.fornecedorId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2026-10-01"),
          valorTotal: Dinheiro.deTexto("1000.00"),
          parcelas,
        },
        usuarioId,
      );

      const detalhe = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      expect(detalhe?.parcelas).toHaveLength(3);
      expect(detalhe?.parcelas.map((p) => p.valorOriginal.paraTexto())).toEqual(["333.33", "333.33", "333.34"]);
      expect(detalhe?.parcelas.map((p) => p.dataVencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
      expect(detalhe?.quantidadeParcelas).toBe(3);

      const [soma] = await banco.execute<{ total: string; titulo: string }>(sql`
        SELECT SUM(p.valor_original)::text AS total, MAX(t.valor_total)::text AS titulo
        FROM parcelas_pagar p JOIN titulos_pagar t ON t.id = p.titulo_pagar_id
        WHERE p.titulo_pagar_id = ${tituloId}
      `);
      expect(soma?.total).toBe(soma?.titulo);
      expect(soma?.total).toBe("1000.00");
    });

    it("vencimento dia 31 cai no ultimo dia do mes que nao tem 31", async () => {
      const parcelas = gerarParcelas({
        quantidade: 4,
        total: Dinheiro.deTexto("400.00"),
        primeiroVencimento: dataCivilDeTexto("2026-01-31") as DataVencimento,
        periodicidade: "mensal",
      });

      const { parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Plano anual",
          fornecedorId: cenario.fornecedorId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2026-01-01"),
          valorTotal: Dinheiro.deTexto("400.00"),
          parcelas,
        },
        usuarioId,
      );

      const detalhe = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      expect(detalhe?.parcelas.map((p) => p.dataVencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    });

    it("cada parcela vira uma linha na lista, com o indicador n/total", async () => {
      const { parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Servico em 5x",
          fornecedorId: cenario.fornecedorId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2027-03-01"),
          valorTotal: Dinheiro.deTexto("500.00"),
          parcelas: gerarParcelas({
            quantidade: 5,
            total: Dinheiro.deTexto("500.00"),
            primeiroVencimento: dataCivilDeTexto("2027-03-15") as DataVencimento,
            periodicidade: "mensal",
          }),
        },
        usuarioId,
      );

      const lista = await repositorio.listar(
        escopo,
        { vencimentoDe: "2027-03-01" as DataVencimento, vencimentoAte: "2027-08-01" as DataVencimento },
        { pagina: 1, tamanho: 50 },
        HOJE,
      );
      expect(lista.total).toBe(5);
      expect(lista.itens.map((i) => `${i.numeroParcela}/${i.quantidadeParcelas}`)).toEqual(["1/5", "2/5", "3/5", "4/5", "5/5"]);
      expect(lista.itens.some((i) => i.parcelaId === parcelaId)).toBe(true);
    });

    it("a situacao de cada parcela e propria: pagar a 1a nao mexe nas outras", async () => {
      const { parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Consultoria em 3x",
          fornecedorId: cenario.fornecedorId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2027-06-01"),
          valorTotal: Dinheiro.deTexto("900.00"),
          parcelas: gerarParcelas({
            quantidade: 3,
            total: Dinheiro.deTexto("900.00"),
            primeiroVencimento: dataCivilDeTexto("2027-06-10") as DataVencimento,
            periodicidade: "mensal",
          }),
        },
        usuarioId,
      );

      await repositorio.registrarPagamento(escopo, parcelaId, pagamentoDe("300.00"));

      const detalhe = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      expect(detalhe?.parcelas.map((p) => p.situacao)).toEqual(["liquidada", "aberta", "aberta"]);
      // O saldo do titulo e a soma do que falta nas parcelas.
      expect(Dinheiro.somarTodos(detalhe!.parcelas.map((p) => p.saldo)).paraTexto()).toBe("600.00");
    });
  });

  // --------------------------------------------------------------- edicao

  describe("travas de edicao", () => {
    const edicao = (extras: Partial<{ descricao: string; fornecedorId: string; vencimento: string; valor: string }> = {}) => ({
      descricao: extras.descricao ?? "Descricao nova",
      categoriaId: cenario.categoriaId,
      fornecedorId: extras.fornecedorId ?? cenario.fornecedorId,
      dataVencimento: dataCivilDeTexto(extras.vencimento ?? "2026-10-05") as DataVencimento,
      valor: Dinheiro.deTexto(extras.valor ?? "100.00"),
    });

    it("sem baixa: descricao, vencimento e valor mudam", async () => {
      const { parcelaId } = await novaConta("100.00");
      await repositorio.editar(escopo, parcelaId, edicao({ descricao: "Aluguel revisado", vencimento: "2026-11-20", valor: "150.00" }), usuarioId);

      const depois = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      expect(depois?.descricao).toBe("Aluguel revisado");
      expect(depois?.dataVencimento).toBe("2026-11-20");
      expect(depois?.valorOriginal.paraTexto()).toBe("150.00");
    });

    it("com baixa ativa: descricao muda, VALOR nao", async () => {
      const { parcelaId } = await novaConta("100.00");
      await repositorio.registrarPagamento(escopo, parcelaId, pagamentoDe("40.00"));

      await repositorio.editar(escopo, parcelaId, edicao({ descricao: "Descricao corrigida", valor: "100.00" }), usuarioId);
      expect((await repositorio.buscarPorId(escopo, parcelaId, HOJE))?.descricao).toBe("Descricao corrigida");

      await expect(repositorio.editar(escopo, parcelaId, edicao({ valor: "999.00" }), usuarioId)).rejects.toThrow("VALOR_BLOQUEADO");
    });

    it("com baixa ativa: VENCIMENTO da parcela baixada nao muda", async () => {
      const { parcelaId } = await novaConta("100.00");
      await repositorio.registrarPagamento(escopo, parcelaId, pagamentoDe("40.00"));

      await expect(
        repositorio.editar(escopo, parcelaId, edicao({ vencimento: "2030-01-01" }), usuarioId),
      ).rejects.toThrow("VENCIMENTO_BLOQUEADO");
    });

    it("com baixa ativa: FORNECEDOR nao muda", async () => {
      const { parcelaId } = await novaConta("100.00");
      await repositorio.registrarPagamento(escopo, parcelaId, pagamentoDe("40.00"));

      const outro = await criarCenarioBase(banco as BancoTeste);
      try {
        await expect(
          repositorio.editar(escopo, parcelaId, edicao({ fornecedorId: outro.fornecedorId }), usuarioId),
        ).rejects.toThrow("FORNECEDOR_BLOQUEADO");
      } finally {
        await apagarCenarioBase(banco as BancoTeste, outro);
      }
    });

    it("parcela AINDA EM ABERTO de titulo com baixa continua editavel", async () => {
      const { tituloId, parcelaId } = await repositorio.criar(
        escopo,
        {
          descricao: "Curso em 2x",
          fornecedorId: cenario.fornecedorId,
          categoriaId: cenario.categoriaId,
          dataCompetencia: dataCivilDeTexto("2027-09-01"),
          valorTotal: Dinheiro.deTexto("200.00"),
          parcelas: gerarParcelas({
            quantidade: 2,
            total: Dinheiro.deTexto("200.00"),
            primeiroVencimento: dataCivilDeTexto("2027-09-10") as DataVencimento,
            periodicidade: "mensal",
          }),
        },
        usuarioId,
      );
      await repositorio.registrarPagamento(escopo, parcelaId, pagamentoDe("100.00"));

      const detalhe = await repositorio.buscarPorId(escopo, parcelaId, HOJE);
      const segunda = detalhe!.parcelas[1]!;

      // A 2a nao teve baixa: vencimento e valor ainda mudam.
      await repositorio.editar(
        escopo,
        segunda.parcelaId,
        { ...edicao({ descricao: "Curso em 2x", vencimento: "2027-12-10", valor: "250.00" }) },
        usuarioId,
      );

      const depois = await repositorio.buscarPorId(escopo, segunda.parcelaId, HOJE);
      expect(depois?.dataVencimento).toBe("2027-12-10");
      expect(depois?.valorOriginal.paraTexto()).toBe("250.00");

      // E o total do titulo e recalculado a partir das parcelas.
      const [linha] = await banco.execute<{ total: string }>(sql`SELECT valor_total::text AS total FROM titulos_pagar WHERE id = ${tituloId}`);
      expect(linha?.total).toBe("350.00");
    });

    it("cancelada: nada muda", async () => {
      const { tituloId, parcelaId } = await novaConta("100.00");
      await repositorio.cancelar(escopo, tituloId, { motivo: "Nao vale mais", usuarioId });

      await expect(repositorio.editar(escopo, parcelaId, edicao({ descricao: "Tentando" }), usuarioId)).rejects.toThrow("EDICAO_BLOQUEADA");
    });

    it("a edicao fica na auditoria, com antes e depois", async () => {
      const { parcelaId } = await novaConta("100.00");
      await repositorio.editar(escopo, parcelaId, edicao({ descricao: "Titulo auditado", valor: "111.00" }), usuarioId);

      const [evento] = await banco.execute<{ antes: string; depois: string }>(sql`
        SELECT dados_antes->>'valor' AS antes, dados_depois->>'valor' AS depois
        FROM eventos_auditoria
        WHERE empresa_id = ${cenario.empresaId} AND acao = 'conta_pagar.editada' AND entidade_id = ${parcelaId}
      `);
      expect(evento?.antes).toBe("100.00");
      expect(evento?.depois).toBe("111.00");
    });
  });

  // --------------------------------------------- paginacao, filtro e fuso

  describe("paginacao e filtro por situacao", () => {
    const TOTAL = 520;
    const VENCIDAS = 120;
    let tituloVolume = "";

    beforeAll(async () => {
      /*
       * 520 parcelas inseridas direto no banco: o alvo do teste e a consulta,
       * nao o caminho de criacao. `generate_series` monta o volume em uma
       * instrucao, em vez de 520 idas ao banco.
       */
      const [titulo] = await banco.execute<{ id: string }>(sql`
        INSERT INTO titulos_pagar (empresa_id, codigo, fornecedor_id, descricao, data_competencia, valor_total, quantidade_parcelas, categoria_id, situacao)
        VALUES (${cenario.empresaId}, ${`CP-VOL-${crypto.randomUUID().slice(0, 6)}`}, ${cenario.fornecedorId},
                'Volume para paginacao', '2028-01-01', ${String(TOTAL * 10)}, ${TOTAL}, ${cenario.categoriaId}, 'aberto')
        RETURNING id
      `);
      tituloVolume = titulo!.id;

      // As 120 primeiras vencem no passado (vencidas); as demais, no futuro.
      await banco.execute(sql`
        INSERT INTO parcelas_pagar (titulo_pagar_id, empresa_id, numero_parcela, data_vencimento, valor_original, situacao)
        SELECT ${tituloVolume}, ${cenario.empresaId}, n,
               CASE WHEN n <= ${VENCIDAS} THEN DATE '2028-01-01' + n ELSE DATE '2028-10-01' + (n - ${VENCIDAS}) END,
               '10.00', 'aberta'
        FROM generate_series(1, ${TOTAL}) AS n
      `);
    });

    afterAll(async () => {
      await banco.execute(sql`DELETE FROM parcelas_pagar WHERE titulo_pagar_id = ${tituloVolume}`);
      await banco.execute(sql`DELETE FROM titulos_pagar WHERE id = ${tituloVolume}`);
    });

    /** "Hoje" depois das vencidas e antes das demais. */
    const DEPOIS = dataCivilDeTexto("2028-09-01");
    const JANELA = { vencimentoDe: "2028-01-01" as DataVencimento, vencimentoAte: "2030-01-01" as DataVencimento };

    it("a pagina traz o tamanho pedido, e o total conta TUDO que passa no filtro", async () => {
      const pagina = await repositorio.listar(escopo, JANELA, { pagina: 1, tamanho: 20 }, DEPOIS);
      expect(pagina.itens).toHaveLength(20);
      expect(pagina.total).toBe(TOTAL);
    });

    it("nenhuma conta some nem se repete entre paginas", async () => {
      const primeira = await repositorio.listar(escopo, JANELA, { pagina: 1, tamanho: 20 }, DEPOIS);
      const segunda = await repositorio.listar(escopo, JANELA, { pagina: 2, tamanho: 20 }, DEPOIS);
      const terceira = await repositorio.listar(escopo, JANELA, { pagina: 3, tamanho: 20 }, DEPOIS);

      const ids = [...primeira.itens, ...segunda.itens, ...terceira.itens].map((i) => i.parcelaId);
      expect(new Set(ids).size).toBe(60);
    });

    it("a ultima pagina fecha a conta exatamente", async () => {
      const ultima = await repositorio.listar(escopo, JANELA, { pagina: TOTAL / 20, tamanho: 20 }, DEPOIS);
      expect(ultima.itens).toHaveLength(20);

      const passando = await repositorio.listar(escopo, JANELA, { pagina: TOTAL / 20 + 1, tamanho: 20 }, DEPOIS);
      expect(passando.itens).toHaveLength(0);
      // O total NAO muda: ele fala do filtro, nao da pagina.
      expect(passando.total).toBe(TOTAL);
    });

    it("o filtro por situacao derivada acontece no BANCO e a contagem o respeita", async () => {
      const vencidas = await repositorio.listar(escopo, { ...JANELA, situacoes: ["vencida"] }, { pagina: 1, tamanho: 20 }, DEPOIS);
      expect(vencidas.total).toBe(VENCIDAS);
      expect(vencidas.itens).toHaveLength(20);
      expect(vencidas.itens.every((i) => i.situacao === "vencida")).toBe(true);

      const abertas = await repositorio.listar(escopo, { ...JANELA, situacoes: ["aberta"] }, { pagina: 1, tamanho: 20 }, DEPOIS);
      expect(abertas.total).toBe(TOTAL - VENCIDAS);
      expect(abertas.itens.every((i) => i.situacao === "aberta")).toBe(true);
    });

    it("o filtro atravessa a paginacao: a pagina 5 de 'vencida' so traz vencidas", async () => {
      const pagina = await repositorio.listar(escopo, { ...JANELA, situacoes: ["vencida"] }, { pagina: 5, tamanho: 20 }, DEPOIS);
      expect(pagina.itens).toHaveLength(20);
      expect(pagina.itens.every((i) => i.situacao === "vencida")).toBe(true);
    });

    it("SQL e TypeScript concordam sobre a situacao derivada", async () => {
      // A mesma regra existe em dois lugares (CASE no SQL, funcao pura em TS).
      // Se as duas divergirem, a lista mostra um selo e o filtro usa outro.
      for (const situacao of ["aberta", "vencida"] as const) {
        const doBanco = await repositorio.listar(escopo, { ...JANELA, situacoes: [situacao] }, { pagina: 1, tamanho: 50 }, DEPOIS);
        expect(doBanco.itens.every((i) => i.situacao === situacao)).toBe(true);
      }
    });
  });

  describe("fuso horario de Sao Paulo", () => {
    it("conta que vence HOJE nao aparece como vencida as 22h de Brasilia", async () => {
      // 23/09 01:00 UTC = 22/09 22:00 em Sao Paulo.
      const vinteEDuasHoras = new Date("2026-09-23T01:00:00Z");
      const hojeEmSaoPaulo = hojeDataCivil("America/Sao_Paulo", vinteEDuasHoras);
      expect(hojeEmSaoPaulo).toBe("2026-09-22");

      const { parcelaId } = await novaConta("50.00", "2026-09-22");

      const lida = await repositorio.buscarPorId(escopo, parcelaId, hojeEmSaoPaulo);
      expect(lida?.situacao).toBe("aberta");

      // E o filtro do banco concorda: ela nao entra em "vencida".
      const vencidas = await repositorio.listar(escopo, { situacoes: ["vencida"] }, { pagina: 1, tamanho: 200 }, hojeEmSaoPaulo);
      expect(vencidas.itens.map((i) => i.parcelaId)).not.toContain(parcelaId);
    });

    it("no dia seguinte, em Sao Paulo, ela passa a vencida", async () => {
      const { parcelaId } = await novaConta("50.00", "2026-09-22");
      const diaSeguinte = hojeDataCivil("America/Sao_Paulo", new Date("2026-09-23T15:00:00Z"));
      expect(diaSeguinte).toBe("2026-09-23");

      const lida = await repositorio.buscarPorId(escopo, parcelaId, diaSeguinte);
      expect(lida?.situacao).toBe("vencida");
    });

    it("em UTC seriam dois dias diferentes — por isso o fuso da empresa manda", async () => {
      const instante = new Date("2026-09-23T01:00:00Z");
      expect(hojeDataCivil("UTC", instante)).toBe("2026-09-23");
      expect(hojeDataCivil("America/Sao_Paulo", instante)).toBe("2026-09-22");
    });
  });
});
