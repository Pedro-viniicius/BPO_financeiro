import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import * as esquema from "@/banco-dados/esquemas/indice";

import {
  criarBancoTeste,
  criarCenarioBase,
  criarExtratoComItem,
  criarMovimentacaoSaida,
  criarTituloPagarComParcela,
  emTransacaoDescartavel,
  ERRO_POSTGRES,
  esperarErroPostgres,
  urlBancoTeste,
} from "./apoio-testes-banco";

/**
 * O banco como guardiao da verdade: cada teste tenta gravar um estado
 * impossivel no negocio e espera que o PostgreSQL recuse.
 */
describe.skipIf(!urlBancoTeste)("restricoes de integridade (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  afterAll(async () => cliente.end());

  describe("chaves estrangeiras", () => {
    it("parcela nao pode referenciar titulo inexistente", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.parcelasPagar).values({
              tituloPagarId: crypto.randomUUID(),
              empresaId: cenario.empresaId,
              numeroParcela: 1,
              dataVencimento: "2026-09-10",
              valorOriginal: "10.00",
            }),
          ERRO_POSTGRES.violacaoChaveEstrangeira,
        );
      }));

    it("filial nao pode pertencer a empresa inexistente", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        await esperarErroPostgres(tx,
          () => tx.insert(esquema.filiais).values({ empresaId: crypto.randomUUID(), nome: "Filial fantasma" }),
          ERRO_POSTGRES.violacaoChaveEstrangeira,
        );
      }));

    it("fornecedor referenciado por titulo nao pode ser apagado (RESTRICT)", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await criarTituloPagarComParcela(tx, cenario);
        await esperarErroPostgres(tx,
          () => tx.delete(esquema.fornecedores).where(eq(esquema.fornecedores.id, cenario.fornecedorId)),
          ERRO_POSTGRES.violacaoChaveEstrangeira,
        );
      }));

    it("titulo com parcelas nao pode ser apagado (historia preservada)", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { tituloId } = await criarTituloPagarComParcela(tx, cenario);
        await esperarErroPostgres(tx,
          () => tx.delete(esquema.titulosPagar).where(eq(esquema.titulosPagar.id, tituloId)),
          ERRO_POSTGRES.violacaoChaveEstrangeira,
        );
      }));

    it("reverter extrato apaga os itens (CASCADE), mas e bloqueado se algum item estiver conciliado", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const semConciliacao = await criarExtratoComItem(tx, cenario);
        await tx.delete(esquema.extratosBancarios).where(eq(esquema.extratosBancarios.id, semConciliacao.extratoId));
        const restantes = await tx
          .select()
          .from(esquema.itensExtratoBancario)
          .where(eq(esquema.itensExtratoBancario.id, semConciliacao.itemId));
        expect(restantes).toHaveLength(0);

        const conciliado = await criarExtratoComItem(tx, cenario);
        const movimentacaoId = await criarMovimentacaoSaida(tx, cenario);
        const [conciliacao] = await tx
          .insert(esquema.conciliacoesBancarias)
          .values({
            empresaId: cenario.empresaId,
            contaBancariaId: cenario.contaBancariaId,
            dataConciliacao: "2026-09-11",
            confianca: "alta",
            origemDecisao: "manual",
          })
          .returning();
        await tx.insert(esquema.conciliacoesItensExtrato).values({ conciliacaoId: conciliacao!.id, itemExtratoId: conciliado.itemId });
        await tx.insert(esquema.conciliacoesMovimentacoes).values({ conciliacaoId: conciliacao!.id, movimentacaoId });
        await esperarErroPostgres(tx,
          () => tx.delete(esquema.extratosBancarios).where(eq(esquema.extratosBancarios.id, conciliado.extratoId)),
          ERRO_POSTGRES.violacaoChaveEstrangeira,
        );
      }));
  });

  describe("unicidade", () => {
    it("mesmo CPF/CNPJ nao se repete na organizacao (mas pode em outra)", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const outra = await criarCenarioBase(tx);
        await tx.insert(esquema.pessoas).values({ organizacaoId: cenario.organizacaoId, tipo: "juridica", nome: "A", cpfCnpj: "11222333000181" });
        await esperarErroPostgres(tx,
          () => tx.insert(esquema.pessoas).values({ organizacaoId: cenario.organizacaoId, tipo: "juridica", nome: "B", cpfCnpj: "11222333000181" }),
          ERRO_POSTGRES.violacaoUnicidade,
        );
        await tx.insert(esquema.pessoas).values({ organizacaoId: outra.organizacaoId, tipo: "juridica", nome: "C", cpfCnpj: "11222333000181" });
      }));

    it("numero de parcela nao se repete no mesmo titulo", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { tituloId } = await criarTituloPagarComParcela(tx, cenario);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.parcelasPagar).values({
              tituloPagarId: tituloId,
              empresaId: cenario.empresaId,
              numeroParcela: 1,
              dataVencimento: "2026-10-10",
              valorOriginal: "10.00",
            }),
          ERRO_POSTGRES.violacaoUnicidade,
        );
      }));

    it("o mesmo arquivo de extrato nao e importado duas vezes na mesma conta (idempotencia)", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await criarExtratoComItem(tx, cenario, { impressaoArquivo: "abc123" });
        await esperarErroPostgres(tx, () => criarExtratoComItem(tx, cenario, { impressaoArquivo: "abc123" }), ERRO_POSTGRES.violacaoUnicidade);
      }));

    it("identificador externo (FITID) nao se repete na conta, mesmo em extratos diferentes", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await criarExtratoComItem(tx, cenario, { identificadorExterno: "FIT-1" });
        await esperarErroPostgres(tx, () => criarExtratoComItem(tx, cenario, { identificadorExterno: "FIT-1" }), ERRO_POSTGRES.violacaoUnicidade);
      }));

    it("um pagamento tem exatamente uma movimentacao; a mesma movimentacao nao serve a dois pagamentos", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { parcelaId } = await criarTituloPagarComParcela(tx, cenario);
        const movimentacaoId = await criarMovimentacaoSaida(tx, cenario);
        const pagamento = {
          parcelaPagarId: parcelaId,
          empresaId: cenario.empresaId,
          contaBancariaId: cenario.contaBancariaId,
          movimentacaoBancariaId: movimentacaoId,
          dataPagamento: "2026-09-10",
          valorPrincipal: "50.00",
          valorPago: "50.00",
          formaPagamento: "pix" as const,
        };
        await tx.insert(esquema.pagamentos).values(pagamento);
        await esperarErroPostgres(tx, () => tx.insert(esquema.pagamentos).values(pagamento), ERRO_POSTGRES.violacaoUnicidade);
      }));

    it("item de orcamento nao se repete nas mesmas dimensoes, mesmo com centro de custo nulo", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const [orcamento] = await tx.insert(esquema.orcamentos).values({ empresaId: cenario.empresaId, nome: "2026", ano: 2026 }).returning();
        const item = { orcamentoId: orcamento!.id, competencia: "2026-03-01", categoriaId: cenario.categoriaId, valorPlanejado: "1000.00" };
        await tx.insert(esquema.itensOrcamento).values(item);
        await esperarErroPostgres(tx, () => tx.insert(esquema.itensOrcamento).values(item), ERRO_POSTGRES.violacaoUnicidade);
      }));
  });

  describe("regras de valor (CHECK)", () => {
    it("parcela com valor zero ou negativo e recusada", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { tituloId } = await criarTituloPagarComParcela(tx, cenario);
        for (const valorOriginal of ["0.00", "-5.00"]) {
          await esperarErroPostgres(tx,
            () =>
              tx.insert(esquema.parcelasPagar).values({
                tituloPagarId: tituloId,
                empresaId: cenario.empresaId,
                numeroParcela: 2,
                dataVencimento: "2026-10-10",
                valorOriginal,
              }),
            ERRO_POSTGRES.violacaoCheck,
          );
        }
      }));

    it("pagamento cujo total nao bate com principal + juros + multa - desconto e recusado", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { parcelaId } = await criarTituloPagarComParcela(tx, cenario);
        const movimentacaoId = await criarMovimentacaoSaida(tx, cenario);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.pagamentos).values({
              parcelaPagarId: parcelaId,
              empresaId: cenario.empresaId,
              contaBancariaId: cenario.contaBancariaId,
              movimentacaoBancariaId: movimentacaoId,
              dataPagamento: "2026-09-10",
              valorPrincipal: "100.00",
              valorJuros: "2.00",
              valorPago: "100.00", // deveria ser 102.00
              formaPagamento: "boleto",
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("CNPJ da empresa precisa ter 14 digitos; CPF de pessoa fisica 11", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await esperarErroPostgres(tx,
          () => tx.insert(esquema.empresas).values({ organizacaoId: cenario.organizacaoId, nome: "X", cnpj: "11.222.333/0001-81" }),
          ERRO_POSTGRES.violacaoCheck,
        );
        await esperarErroPostgres(tx,
          () => tx.insert(esquema.pessoas).values({ organizacaoId: cenario.organizacaoId, tipo: "fisica", nome: "Ana", cpfCnpj: "11222333000181" }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("transferencia entre a mesma conta e recusada", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const saida = await criarMovimentacaoSaida(tx, cenario);
        const entrada = await criarMovimentacaoSaida(tx, cenario);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.transferencias).values({
              empresaId: cenario.empresaId,
              contaOrigemId: cenario.contaBancariaId,
              contaDestinoId: cenario.contaBancariaId,
              dataTransferencia: "2026-09-10",
              valor: "10.00",
              movimentacaoSaidaId: saida,
              movimentacaoEntradaId: entrada,
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("movimentacao de estorno exige referencia a original, e vice-versa", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.movimentacoesBancarias).values({
              empresaId: cenario.empresaId,
              contaBancariaId: cenario.contaBancariaId,
              dataMovimentacao: "2026-09-10",
              tipo: "entrada",
              valor: "10.00",
              descricao: "estorno sem origem",
              origem: "estorno",
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("conta do tipo caixa nao tem instituicao; conta corrente exige", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.contasBancarias).values({
              empresaId: cenario.empresaId,
              tipo: "caixa",
              nome: "Caixa com banco",
              instituicaoBancariaId: cenario.instituicaoId,
              dataSaldoInicial: "2026-01-01",
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.contasBancarias).values({
              empresaId: cenario.empresaId,
              tipo: "conta_corrente",
              nome: "Corrente sem banco",
              dataSaldoInicial: "2026-01-01",
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("segregacao de funcoes: quem registrou o titulo nao pode aprova-lo", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const [usuario] = await tx.insert(esquema.user).values({ name: "Ana", email: `ana-${crypto.randomUUID()}@teste.local` }).returning();
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.titulosPagar).values({
              empresaId: cenario.empresaId,
              codigo: "CP-2026-000001",
              fornecedorId: cenario.fornecedorId,
              descricao: "Autoaprovado",
              dataCompetencia: "2026-08-01",
              categoriaId: cenario.categoriaId,
              situacao: "aberto",
              criadoPorUsuarioId: usuario!.id,
              aprovadoPorUsuarioId: usuario!.id,
              aprovadoEm: new Date(),
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));

    it("item de orcamento exige competencia no dia 1 do mes", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const [orcamento] = await tx.insert(esquema.orcamentos).values({ empresaId: cenario.empresaId, nome: "2026", ano: 2026 }).returning();
        await esperarErroPostgres(tx,
          () =>
            tx.insert(esquema.itensOrcamento).values({
              orcamentoId: orcamento!.id,
              competencia: "2026-03-15",
              categoriaId: cenario.categoriaId,
              valorPlanejado: "10.00",
            }),
          ERRO_POSTGRES.violacaoCheck,
        );
      }));
  });

  describe("obrigatoriedade (NOT NULL)", () => {
    it("parcela sem data de vencimento e recusada", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { tituloId } = await criarTituloPagarComParcela(tx, cenario);
        await esperarErroPostgres(tx,
          () =>
            tx.execute(
              sql`INSERT INTO parcelas_pagar (titulo_pagar_id, empresa_id, numero_parcela, valor_original) VALUES (${tituloId}, ${cenario.empresaId}, 2, 10.00)`,
            ),
          ERRO_POSTGRES.violacaoNaoNulo,
        );
      }));
  });

  describe("conciliacao", () => {
    it("um item de extrato so participa de uma conciliacao ativa; desfeita, pode ser reconciliado", () =>
      emTransacaoDescartavel(banco, async (tx) => {
        const cenario = await criarCenarioBase(tx);
        const { itemId } = await criarExtratoComItem(tx, cenario);
        const criarConciliacao = async () => {
          const [c] = await tx
            .insert(esquema.conciliacoesBancarias)
            .values({
              empresaId: cenario.empresaId,
              contaBancariaId: cenario.contaBancariaId,
              dataConciliacao: "2026-09-11",
              confianca: "possivel",
              origemDecisao: "manual",
            })
            .returning();
          return c!.id;
        };
        const primeira = await criarConciliacao();
        await tx.insert(esquema.conciliacoesItensExtrato).values({ conciliacaoId: primeira, itemExtratoId: itemId });

        const segunda = await criarConciliacao();
        await esperarErroPostgres(tx,
          () => tx.insert(esquema.conciliacoesItensExtrato).values({ conciliacaoId: segunda, itemExtratoId: itemId }),
          ERRO_POSTGRES.violacaoUnicidade,
        );

        // desfazer a primeira: vinculos inativos, decisao preservada
        await tx
          .update(esquema.conciliacoesBancarias)
          .set({ desfeitaEm: new Date(), motivoDesfazer: "erro de digitacao" })
          .where(eq(esquema.conciliacoesBancarias.id, primeira));
        await tx.update(esquema.conciliacoesItensExtrato).set({ ativo: false }).where(eq(esquema.conciliacoesItensExtrato.conciliacaoId, primeira));
        await tx.insert(esquema.conciliacoesItensExtrato).values({ conciliacaoId: segunda, itemExtratoId: itemId });

        const vinculos = await tx.select().from(esquema.conciliacoesItensExtrato).where(eq(esquema.conciliacoesItensExtrato.itemExtratoId, itemId));
        expect(vinculos).toHaveLength(2);
      }));
  });
});
