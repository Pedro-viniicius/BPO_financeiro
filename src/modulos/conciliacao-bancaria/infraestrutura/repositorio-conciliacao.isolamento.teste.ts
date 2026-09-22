import { readFileSync } from "node:fs";

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
import { RepositorioContasPagarDrizzle } from "@/modulos/contas-pagar/publico";
import { RepositorioContasReceberDrizzle } from "@/modulos/contas-receber/publico";

import { RepositorioConciliacaoDrizzle } from "./repositorio-conciliacao-drizzle";

/**
 * Conciliacao bancaria contra PostgreSQL real, incluindo o isolamento entre
 * empresas exigido pela ADR-017.
 *
 * O extrato usado e o exemplo do Banco do Brasil (`exemplos-ofx/`), com quatro
 * lancamentos: pagamento de 1.000, recebimento de 2.500, tarifa de 32,90 e
 * deposito de 800.
 */
describe.skipIf(!urlBancoTeste)("conciliacao bancaria (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const conciliacao = new RepositorioConciliacaoDrizzle(banco as never);
  const contasPagar = new RepositorioContasPagarDrizzle(banco as never);
  const contasReceber = new RepositorioContasReceberDrizzle(banco as never);

  const HOJE = dataCivilDeTexto("2026-10-01");
  const OFX = new Uint8Array(readFileSync("src/modulos/conciliacao-bancaria/dominio/exemplos-ofx/banco-do-brasil-1.02-latin1.ofx"));

  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  const importar = (extras: Partial<{ conteudo: Uint8Array; confirmou: boolean; nome: string }> = {}) =>
    conciliacao.importarOfx(escopo, {
      contaBancariaId: cenario.contaBancariaId,
      nomeArquivo: extras.nome ?? "extrato-setembro.ofx",
      conteudo: extras.conteudo ?? OFX,
      usuarioId,
      confirmouContaDivergente: extras.confirmou ?? true,
    });

  const painel = () => conciliacao.montarPainel(escopo, cenario.contaBancariaId, HOJE);

  async function criarMovimentacao(data: string, tipo: "entrada" | "saida", valor: string, descricao: string): Promise<string> {
    const [linha] = await banco.execute<{ id: string }>(sql`
      INSERT INTO movimentacoes_bancarias (empresa_id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, origem, categoria_id)
      VALUES (${cenario.empresaId}, ${cenario.contaBancariaId}, ${data}::date, ${tipo}, ${valor}, ${descricao}, 'ajuste_manual', ${cenario.categoriaId})
      RETURNING id::text AS id
    `);
    return linha!.id;
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
      VALUES (${usuarioId}, 'Teste Conciliacao', ${`cc-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM conciliacoes_itens_extrato WHERE conciliacao_id IN (SELECT id FROM conciliacoes_bancarias WHERE empresa_id = ${cenario.empresaId})`);
    await banco.execute(sql`DELETE FROM conciliacoes_movimentacoes WHERE conciliacao_id IN (SELECT id FROM conciliacoes_bancarias WHERE empresa_id = ${cenario.empresaId})`);
    await banco.execute(sql`DELETE FROM conciliacoes_bancarias WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM itens_extrato_bancario WHERE conta_bancaria_id IN (${cenario.contaBancariaId}, ${cenario.contaCaixaId})`);
    await banco.execute(sql`DELETE FROM extratos_bancarios WHERE empresa_id = ${cenario.empresaId}`);
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

  // ------------------------------------------------------------ importacao

  it("importa o OFX e grava os quatro lancamentos", async () => {
    const resultado = await importar();

    expect(resultado.importados).toBe(4);
    expect(resultado.duplicados).toBe(0);
    expect(resultado.dataInicio).toBe("2026-09-01");
    expect(resultado.dataFim).toBe("2026-09-30");
    expect(resultado.saldoInformado?.paraTexto()).toBe("12267.10");
  });

  it("DEDUPLICACAO: reimportar o mesmo arquivo nao duplica nada", async () => {
    const antes = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM itens_extrato_bancario WHERE conta_bancaria_id = ${cenario.contaBancariaId}`,
    );
    const resultado = await importar();

    expect(resultado.importados).toBe(0);
    expect(resultado.duplicados).toBe(4);

    const depois = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM itens_extrato_bancario WHERE conta_bancaria_id = ${cenario.contaBancariaId}`,
    );
    expect(Number(depois[0]?.total)).toBe(Number(antes[0]?.total));
  });

  it("guarda o lote com quem importou, quando, o periodo e a quantidade", async () => {
    const importacoes = await conciliacao.listarImportacoes(escopo, cenario.contaBancariaId);
    expect(importacoes).toHaveLength(1);
    expect(importacoes[0]).toMatchObject({
      nomeArquivo: "extrato-setembro.ofx",
      importadoPorNome: "Teste Conciliacao",
      dataInicio: "2026-09-01",
      dataFim: "2026-09-30",
      quantidadeItens: 4,
    });
  });

  it("avisa quando a conta do arquivo nao e a conta escolhida, e so segue com confirmacao", async () => {
    const [outraConta] = await banco.execute<{ id: string }>(sql`
      INSERT INTO contas_bancarias (empresa_id, tipo, nome, instituicao_bancaria_id, agencia, numero_conta, saldo_inicial, data_saldo_inicial)
      VALUES (${cenario.empresaId}, 'conta_corrente', ${`Outra ${crypto.randomUUID().slice(0, 6)}`}, ${cenario.instituicaoId}, '9999', '55555-5', '0.00', '2026-01-01')
      RETURNING id::text AS id
    `);

    const pedido = {
      contaBancariaId: outraConta!.id,
      nomeArquivo: "extrato-de-outra-conta.ofx",
      conteudo: OFX,
      usuarioId,
    };

    // O arquivo diz conta 98765-4; a conta escolhida e a 55555-5.
    await expect(conciliacao.importarOfx(escopo, pedido)).rejects.toThrow("CONTA_DIVERGENTE");

    // Com a confirmacao explicita do usuario, entra.
    const resultado = await conciliacao.importarOfx(escopo, { ...pedido, confirmouContaDivergente: true });
    expect(resultado.importados).toBe(4);

    await banco.execute(sql`DELETE FROM itens_extrato_bancario WHERE conta_bancaria_id = ${outraConta!.id}`);
    await banco.execute(sql`DELETE FROM extratos_bancarios WHERE conta_bancaria_id = ${outraConta!.id}`);
    await banco.execute(sql`DELETE FROM contas_bancarias WHERE id = ${outraConta!.id}`);
  });

  it("recusa arquivo que nao e OFX", async () => {
    await expect(importar({ conteudo: new TextEncoder().encode("Data;Valor\n01/09;10") })).rejects.toThrow(
      /não parece ser um extrato OFX/,
    );
  });

  // ---------------------------------------------------------------- painel

  it("o painel traz os itens do extrato e as movimentacoes pendentes", async () => {
    const resultado = (await painel())!;
    expect(resultado.contaNome).toBeTruthy();
    expect(resultado.itens).toHaveLength(4);
    expect(resultado.temExtrato).toBe(true);
    expect(resultado.resumo.itensPendentes).toBe(4);
    expect(resultado.resumo.saldoDoExtrato?.paraTexto()).toBe("12267.10");
  });

  it("a diferenca entre extrato e sistema fica visivel", async () => {
    const resultado = (await painel())!;
    // Sem nenhuma movimentacao ainda, o sistema tem so o saldo inicial (1.000).
    expect(resultado.resumo.saldoDoSistema.paraTexto()).toBe("1000.00");
    expect(resultado.resumo.diferenca?.paraTexto()).toBe("11267.10");
  });

  it("sugere a movimentacao de mesmo valor e data, e marca como exata", async () => {
    await criarMovimentacao("2026-09-10", "saida", "32.90", "Tarifa lancada a mao");
    const resultado = (await painel())!;

    const tarifa = resultado.itens.find((item) => item.valor.paraTexto() === "32.90")!;
    expect(tarifa.candidatas).toHaveLength(1);
    expect(tarifa.confianca).toBe("alta");
    expect(tarifa.exata).toBe(true);
    expect(resultado.resumo.sugestoesExatas).toBe(1);
  });

  it("com DUAS candidatas, mostra as duas e nao marca exata", async () => {
    const a = await criarMovimentacao("2026-09-15", "entrada", "800.00", "Deposito A");
    const b = await criarMovimentacao("2026-09-15", "entrada", "800.00", "Deposito B");
    const resultado = (await painel())!;

    const deposito = resultado.itens.find((item) => item.valor.paraTexto() === "800.00")!;
    expect(deposito.candidatas).toHaveLength(2);
    expect(deposito.confianca).toBe("revisao");
    expect(deposito.exata).toBe(false);

    await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE id IN (${a}, ${b})`);
  });

  // ------------------------------------------------------------- conciliar

  it("concilia 1:1 e o item sai dos pendentes", async () => {
    const resultado = (await painel())!;
    const tarifa = resultado.itens.find((item) => item.valor.paraTexto() === "32.90" && !item.conciliado)!;

    const { conciliacaoId } = await conciliacao.conciliar(escopo, {
      contaBancariaId: cenario.contaBancariaId,
      itensExtratoIds: [tarifa.id],
      movimentacaoIds: [tarifa.candidatas[0]!.movimentacaoId],
      origemDecisao: "manual",
      usuarioId,
    });
    expect(conciliacaoId).toBeTruthy();

    const depois = (await painel())!;
    const mesmoItem = depois.itens.find((item) => item.id === tarifa.id)!;
    expect(mesmoItem.conciliado).toBe(true);
    expect(depois.resumo.itensPendentes).toBe(3);
  });

  it("recusa conciliar o mesmo item duas vezes", async () => {
    const resultado = (await painel())!;
    const conciliado = resultado.itens.find((item) => item.conciliado)!;
    const movimentacao = await criarMovimentacao("2026-09-10", "saida", "32.90", "Outra tarifa");

    await expect(
      conciliacao.conciliar(escopo, {
        contaBancariaId: cenario.contaBancariaId,
        itensExtratoIds: [conciliado.id],
        movimentacaoIds: [movimentacao],
        origemDecisao: "manual",
        usuarioId,
      }),
    ).rejects.toThrow("ITEM_JA_CONCILIADO");

    await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE id = ${movimentacao}`);
  });

  it("concilia 1:N quando a soma bate exatamente", async () => {
    const primeira = await criarMovimentacao("2026-09-05", "entrada", "1500.00", "Mensalidade 1");
    const segunda = await criarMovimentacao("2026-09-05", "entrada", "1000.00", "Mensalidade 2");

    const resultado = (await painel())!;
    const deposito = resultado.itens.find((item) => item.valor.paraTexto() === "2500.00" && !item.conciliado)!;

    const { conciliacaoId } = await conciliacao.conciliar(escopo, {
      contaBancariaId: cenario.contaBancariaId,
      itensExtratoIds: [deposito.id],
      movimentacaoIds: [primeira, segunda],
      origemDecisao: "manual",
      usuarioId,
    });

    const [confianca] = await banco.execute<{ confianca: string }>(
      sql`SELECT confianca::text AS confianca FROM conciliacoes_bancarias WHERE id = ${conciliacaoId}`,
    );
    expect(confianca?.confianca).toBe("revisao");

    const depois = (await painel())!;
    expect(depois.itens.find((item) => item.id === deposito.id)?.conciliado).toBe(true);
  });

  it("RECUSA 1:N com soma divergente, dizendo os dois totais", async () => {
    const movimentacao = await criarMovimentacao("2026-09-03", "saida", "999.00", "Quase mil");
    const resultado = (await painel())!;
    const pagamento = resultado.itens.find((item) => item.valor.paraTexto() === "1000.00" && !item.conciliado)!;

    await expect(
      conciliacao.conciliar(escopo, {
        contaBancariaId: cenario.contaBancariaId,
        itensExtratoIds: [pagamento.id],
        movimentacaoIds: [movimentacao],
        origemDecisao: "manual",
        usuarioId,
      }),
    ).rejects.toThrow(/DESEQUILIBRADA.*R\$ 1\.000,00.*R\$ 999,00/s);

    await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE id = ${movimentacao}`);
  });

  it("recusa misturar entrada com saida", async () => {
    const movimentacao = await criarMovimentacao("2026-09-03", "entrada", "1000.00", "Sentido errado");
    const resultado = (await painel())!;
    const pagamento = resultado.itens.find((item) => item.valor.paraTexto() === "1000.00" && !item.conciliado)!;

    await expect(
      conciliacao.conciliar(escopo, {
        contaBancariaId: cenario.contaBancariaId,
        itensExtratoIds: [pagamento.id],
        movimentacaoIds: [movimentacao],
        origemDecisao: "manual",
        usuarioId,
      }),
    ).rejects.toThrow(/mesmo sentido/);

    await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE id = ${movimentacao}`);
  });

  // ------------------------------------------------------------ desfazer

  it("desconciliar libera os dois lados e guarda o motivo", async () => {
    const antes = (await painel())!;
    const conciliado = antes.itens.find((item) => item.conciliado)!;

    await conciliacao.desconciliar(escopo, conciliado.conciliacaoId!, {
      motivo: "Casei com o lancamento errado",
      usuarioId,
    });

    const depois = (await painel())!;
    const liberado = depois.itens.find((item) => item.id === conciliado.id)!;
    expect(liberado.conciliado).toBe(false);

    const [registro] = await banco.execute<{ motivo: string; desfeita: string | null }>(sql`
      SELECT motivo_desfazer AS motivo, desfeita_em::text AS desfeita
      FROM conciliacoes_bancarias WHERE id = ${conciliado.conciliacaoId}
    `);
    expect(registro?.motivo).toBe("Casei com o lancamento errado");
    expect(registro?.desfeita).not.toBeNull();

    // O vinculo continua no historico, apenas inativo.
    const [vinculo] = await banco.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM conciliacoes_itens_extrato WHERE conciliacao_id = ${conciliado.conciliacaoId}`,
    );
    expect(Number(vinculo?.total)).toBeGreaterThan(0);
  });

  it("recusa desconciliar duas vezes e exige motivo", async () => {
    const resultado = (await painel())!;
    const conciliado = resultado.itens.find((item) => item.conciliado)!;

    await expect(
      conciliacao.desconciliar(escopo, conciliado.conciliacaoId!, { motivo: "   ", usuarioId }),
    ).rejects.toThrow("MOTIVO_OBRIGATORIO");

    await conciliacao.desconciliar(escopo, conciliado.conciliacaoId!, { motivo: "Motivo valido", usuarioId });
    await expect(
      conciliacao.desconciliar(escopo, conciliado.conciliacaoId!, { motivo: "De novo", usuarioId }),
    ).rejects.toThrow("CONCILIACAO_JA_DESFEITA");
  });

  // ------------------------------------------- criar a partir do extrato

  it("cria a tarifa a partir do item e ja deixa conciliada", async () => {
    const resultado = (await painel())!;
    const tarifa = resultado.itens.find((item) => item.valor.paraTexto() === "32.90" && !item.conciliado)!;

    const { movimentacaoId } = await conciliacao.criarLancamentoDoItem(escopo, tarifa.id, {
      categoriaId: cenario.categoriaId,
      usuarioId,
    });

    const [movimentacao] = await banco.execute<{ origem: string; categoria: string | null; valor: string; tipo: string }>(sql`
      SELECT origem::text AS origem, categoria_id::text AS categoria, valor, tipo
      FROM movimentacoes_bancarias WHERE id = ${movimentacaoId}
    `);
    expect(movimentacao?.origem).toBe("extrato");
    expect(movimentacao?.categoria).toBe(cenario.categoriaId);
    expect(movimentacao?.valor).toBe("32.90");
    expect(movimentacao?.tipo).toBe("saida");

    const depois = (await painel())!;
    expect(depois.itens.find((item) => item.id === tarifa.id)?.conciliado).toBe(true);
  });

  it("lancamento avulso exige categoria que exista nesta empresa", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const resultado = (await painel())!;
      const pendente = resultado.itens.find((item) => !item.conciliado)!;
      await expect(
        conciliacao.criarLancamentoDoItem(escopo, pendente.id, { categoriaId: outra.categoriaId, usuarioId }),
      ).rejects.toThrow("CATEGORIA_NAO_ENCONTRADA");
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("cria a BAIXA a partir do item: parcela, movimentacao e conciliacao juntas", async () => {
    const { parcelaId } = await contasPagar.criar(
      escopo,
      {
        descricao: "Fornecedor do extrato",
        fornecedorId: cenario.fornecedorId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-09-01"),
        valorTotal: Dinheiro.deTexto("1000.00"),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto("2026-09-03") as DataVencimento, valor: Dinheiro.deTexto("1000.00") }],
      },
      usuarioId,
    );

    const resultado = (await painel())!;
    const pagamento = resultado.itens.find((item) => item.valor.paraTexto() === "1000.00" && !item.conciliado)!;

    const { movimentacaoId } = await conciliacao.criarBaixaDoItem(escopo, pagamento.id, {
      area: "pagar",
      parcelaId,
      formaPagamento: "pix",
      usuarioId,
    });

    const conta = await contasPagar.buscarPorId(escopo, parcelaId, HOJE);
    expect(conta?.situacao).toBe("liquidada");
    expect(conta?.pagamentos).toHaveLength(1);

    const depois = (await painel())!;
    expect(depois.itens.find((item) => item.id === pagamento.id)?.conciliado).toBe(true);
    expect(depois.movimentacoes.some((m) => m.id === movimentacaoId)).toBe(false);
  });

  it("ATOMICIDADE: baixa que falha nao deixa a parcela paga nem o item conciliado", async () => {
    const { parcelaId } = await contasReceber.criar(
      escopo,
      {
        descricao: "Cliente do extrato",
        clienteId: cenario.clienteId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-09-01"),
        valorTotal: Dinheiro.deTexto("2500.00"),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto("2026-09-05") as DataVencimento, valor: Dinheiro.deTexto("2500.00") }],
      },
      usuarioId,
    );

    const resultado = (await painel())!;
    const deposito = resultado.itens.find((item) => item.valor.paraTexto() === "2500.00" && !item.conciliado)!;

    // Forma de pagamento invalida derruba o INSERT do recebimento, DEPOIS de a
    // movimentacao ja ter sido gravada. Nada pode sobrar.
    await expect(
      conciliacao.criarBaixaDoItem(escopo, deposito.id, {
        area: "receber",
        parcelaId,
        formaPagamento: "nao_existe",
        usuarioId,
      }),
    ).rejects.toThrow();

    const conta = await contasReceber.buscarPorId(escopo, parcelaId, HOJE);
    expect(conta?.valorRecebido.paraTexto()).toBe("0.00");
    expect(conta?.recebimentos).toHaveLength(0);

    const depois = (await painel())!;
    expect(depois.itens.find((item) => item.id === deposito.id)?.conciliado).toBe(false);

    // E agora, com forma valida, funciona.
    await conciliacao.criarBaixaDoItem(escopo, deposito.id, {
      area: "receber",
      parcelaId,
      formaPagamento: "pix",
      usuarioId,
    });
    expect((await contasReceber.buscarPorId(escopo, parcelaId, HOJE))?.situacao).toBe("liquidada");
  });

  it("recusa baixa com sentido incompativel", async () => {
    const resultado = (await painel())!;
    const pendente = resultado.itens.find((item) => !item.conciliado && item.tipo === "entrada");
    if (!pendente) return;

    await expect(
      conciliacao.criarBaixaDoItem(escopo, pendente.id, {
        area: "pagar",
        parcelaId: crypto.randomUUID(),
        formaPagamento: "pix",
        usuarioId,
      }),
    ).rejects.toThrow("SENTIDO_INCOMPATIVEL");
  });

  // --------------------------------------------- bloqueio do estorno

  it("BLOQUEIO: baixa conciliada nao pode ser estornada sem desconciliar antes", async () => {
    const { parcelaId } = await contasPagar.criar(
      escopo,
      {
        descricao: "Conta conciliada",
        fornecedorId: cenario.fornecedorId,
        categoriaId: cenario.categoriaId,
        dataCompetencia: dataCivilDeTexto("2026-09-01"),
        valorTotal: Dinheiro.deTexto("800.00"),
        parcelas: [{ numero: 1, dataVencimento: dataCivilDeTexto("2026-09-15") as DataVencimento, valor: Dinheiro.deTexto("800.00") }],
      },
      usuarioId,
    );

    const resultado = (await painel())!;
    const deposito = resultado.itens.find((item) => item.valor.paraTexto() === "800.00" && !item.conciliado);
    if (!deposito) throw new Error("item de 800 nao encontrado");

    // O item de 800 e uma ENTRADA; para a baixa a pagar preciso conciliar a mao.
    await contasPagar.registrarPagamento(escopo, parcelaId, {
      contaBancariaId: cenario.contaBancariaId,
      dataPagamento: dataCivilDeTexto("2026-09-15"),
      valorPrincipal: Dinheiro.deTexto("800.00"),
      valorJuros: Dinheiro.zero(),
      valorMulta: Dinheiro.zero(),
      valorDesconto: Dinheiro.zero(),
      formaPagamento: "pix",
      usuarioId,
    });
    const conta = await contasPagar.buscarPorId(escopo, parcelaId, HOJE);
    const pagamento = conta!.pagamentos[0]!;
    expect(pagamento.podeEstornar).toBe(true);

    const [movimentacao] = await banco.execute<{ id: string }>(
      sql`SELECT movimentacao_bancaria_id::text AS id FROM pagamentos WHERE id = ${pagamento.id}`,
    );
    const [itemFalso] = await banco.execute<{ id: string }>(sql`
      INSERT INTO itens_extrato_bancario (extrato_bancario_id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, identificador_externo, impressao_digital_linha)
      SELECT id, ${cenario.contaBancariaId}, '2026-09-15'::date, 'saida', '800.00', 'SAIDA CONCILIAVEL', ${`fit-${crypto.randomUUID()}`}, ${crypto.randomUUID()}
      FROM extratos_bancarios WHERE conta_bancaria_id = ${cenario.contaBancariaId} LIMIT 1
      RETURNING id::text AS id
    `);

    const { conciliacaoId } = await conciliacao.conciliar(escopo, {
      contaBancariaId: cenario.contaBancariaId,
      itensExtratoIds: [itemFalso!.id],
      movimentacaoIds: [movimentacao!.id],
      origemDecisao: "manual",
      usuarioId,
    });

    // Agora o estorno e recusado, com o motivo explicito.
    await expect(
      contasPagar.estornarPagamento(escopo, pagamento.id, {
        motivo: "Errei o valor",
        dataEstorno: HOJE,
        usuarioId,
      }),
    ).rejects.toThrow("BAIXA_CONCILIADA");

    const bloqueada = await contasPagar.buscarPorId(escopo, parcelaId, HOJE);
    expect(bloqueada!.pagamentos[0]!.podeEstornar).toBe(false);

    // Desconciliando, o estorno volta a ser possivel.
    await conciliacao.desconciliar(escopo, conciliacaoId, { motivo: "Preciso corrigir a baixa", usuarioId });
    await contasPagar.estornarPagamento(escopo, pagamento.id, { motivo: "Errei o valor", dataEstorno: HOJE, usuarioId });
    const estornada = await contasPagar.buscarPorId(escopo, parcelaId, HOJE);
    expect(estornada?.valorPago.paraTexto()).toBe("0.00");
    // Vence em 15/09 e "hoje" no teste e 01/10: volta a aberta e ja vencida.
    expect(estornada?.situacao).toBe("vencida");
  });

  // ---------------------------------------------------------------- ignorar

  it("ignorar guarda o motivo e tira o item dos pendentes", async () => {
    const resultado = (await painel())!;
    const pendente = resultado.itens.find((item) => !item.conciliado && !item.ignorado);
    if (!pendente) return;

    await expect(conciliacao.ignorarItem(escopo, pendente.id, { motivo: "  ", usuarioId })).rejects.toThrow(
      "MOTIVO_OBRIGATORIO",
    );

    await conciliacao.ignorarItem(escopo, pendente.id, { motivo: "Lancamento duplicado pelo banco", usuarioId });

    const depois = (await painel())!;
    const ignorado = depois.itens.find((item) => item.id === pendente.id)!;
    expect(ignorado.ignorado).toBe(true);
    expect(ignorado.motivoIgnorar).toBe("Lancamento duplicado pelo banco");
  });

  // ------------------------------------------------------------- isolamento

  it("ISOLAMENTO: outra empresa nao ve o extrato nem concilia com ele", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };

      // Nem abre o painel da conta alheia, mesmo sabendo o UUID.
      expect(await conciliacao.montarPainel(escopoOutra, cenario.contaBancariaId, HOJE)).toBeNull();
      expect(await conciliacao.listarImportacoes(escopoOutra, cenario.contaBancariaId)).toEqual([]);

      const meu = (await painel())!;
      const qualquerItem = meu.itens[0]!;
      await expect(
        conciliacao.ignorarItem(escopoOutra, qualquerItem.id, { motivo: "Tentativa de fora", usuarioId }),
      ).rejects.toThrow("ITEM_NAO_ENCONTRADO");
      await expect(
        conciliacao.criarLancamentoDoItem(escopoOutra, qualquerItem.id, { categoriaId: outra.categoriaId, usuarioId }),
      ).rejects.toThrow("ITEM_NAO_ENCONTRADO");

      // E nao importa para a conta de outra empresa.
      await expect(
        conciliacao.importarOfx(escopoOutra, {
          contaBancariaId: cenario.contaBancariaId,
          nomeArquivo: "invasao.ofx",
          conteudo: OFX,
          usuarioId,
          confirmouContaDivergente: true,
        }),
      ).rejects.toThrow("CONTA_BANCARIA_NAO_ENCONTRADA");
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
