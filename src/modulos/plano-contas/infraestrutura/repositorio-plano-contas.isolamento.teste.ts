import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { CategoriaEmUso, ContaEmUso } from "../dominio/erros";
import { REFERENCIAS_A_CATEGORIA, RepositorioPlanoContasDrizzle } from "./repositorio-plano-contas-drizzle";

/**
 * Plano de contas contra PostgreSQL real.
 *
 * A regra que este arquivo existe para provar: NADA APAGA HISTORIA. Categoria
 * usada num lancamento nao pode ser excluida — o lancamento antigo perderia a
 * classificacao e o demonstrativo do ano passado mudaria sozinho.
 *
 * Cobre tambem o ISOLAMENTO entre empresas (controle 3 do ADR-017): sem RLS,
 * o filtro por `empresa_id` e a unica barreira, e o plano de uma empresa nunca
 * pode aparecer na consulta de outra.
 */
describe.skipIf(!urlBancoTeste)("plano de contas (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const plano = new RepositorioPlanoContasDrizzle(banco as never);
  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    usuarioId = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Plano', ${`plano-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM parcelas_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${cenario.empresaId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  /**
   * A LISTA DE REFERENCIAS NAO PODE ENVELHECER.
   *
   * O repositorio conta os usos de uma categoria somando tabela por tabela,
   * numa lista escrita a mao. Quem impede a exclusao de verdade e a chave
   * estrangeira (`RESTRICT`), entao uma lista desatualizada nao apaga dado —
   * mas faz a tela dizer "pode excluir" e a exclusao estourar na cara do
   * usuario com erro de banco. Aqui a lista e comparada com o catalogo.
   */
  it("conhece TODAS as tabelas que apontam para categorias_financeiras", async () => {
    const reais = await banco.execute<{ tabela: string; coluna: string }>(sql`
      SELECT c.conrelid::regclass::text AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.contype = 'f' AND c.confrelid = 'categorias_financeiras'::regclass
      ORDER BY 1, 2
    `);

    const conhecidas = new Set(REFERENCIAS_A_CATEGORIA.map((r) => `${r.tabela}.${r.coluna}`));
    const desconhecidas = reais.map((r) => `${r.tabela}.${r.coluna}`).filter((r) => !conhecidas.has(r));

    expect(
      desconhecidas,
      "Nova referencia a categorias_financeiras. Acrescente em TABELAS_QUE_USAM_CATEGORIA, senao a tela vai oferecer excluir uma categoria em uso.",
    ).toEqual([]);
  });

  it("monta a arvore por grupo, e avisa quais linhas do DRE ficariam sem categoria", async () => {
    const { contaId } = await plano.criarConta(escopo, { codigo: "7.1.01", nome: "Receitas do teste", grupoDre: "receita_bruta" }, usuarioId);
    await plano.criarCategoria(escopo, { nome: "Mensalidade do teste", contaPlanoId: contaId }, usuarioId);

    const arvore = await plano.montar(escopo);
    const grupo = arvore.grupos.find((g) => g.grupo === "receita_bruta");
    expect(grupo?.contas.some((c) => c.codigo === "7.1.01")).toBe(true);

    // O cenario base nao tem custo nem nao operacional: o aviso precisa dizer.
    const linhas = arvore.linhasSemCategoria.map((l) => l.linha);
    expect(linhas).toContain("custos");
    expect(linhas).toContain("nao_operacional");
    // E NUNCA cobra descontos: eles vem das baixas, nao de categoria.
    expect(linhas).not.toContain("descontos_obtidos");
    expect(linhas).not.toContain("descontos_concedidos");
  });

  it("categoria NOVA pode ser excluida; categoria USADA, nao", async () => {
    const { contaId } = await plano.criarConta(escopo, { codigo: "7.2.01", nome: "Despesas do teste", grupoDre: "despesa_operacional" }, usuarioId);
    const { categoriaId: semUso } = await plano.criarCategoria(escopo, { nome: "Nunca usada", contaPlanoId: contaId }, usuarioId);
    const { categoriaId: emUso } = await plano.criarCategoria(escopo, { nome: "Usada num titulo", contaPlanoId: contaId }, usuarioId);

    await banco.execute(sql`
      INSERT INTO titulos_pagar (empresa_id, codigo, descricao, fornecedor_id, categoria_id, data_competencia, valor_total, quantidade_parcelas, situacao)
      VALUES (${cenario.empresaId}, 'CP-TESTE-PLANO', 'Titulo do teste', ${cenario.fornecedorId}, ${emUso}, '2026-09-01', '100.00', 1, 'aberto')
    `);

    await expect(plano.excluirCategoria(escopo, semUso, usuarioId)).resolves.toBeUndefined();
    await expect(plano.excluirCategoria(escopo, emUso, usuarioId)).rejects.toBeInstanceOf(CategoriaEmUso);

    // E a arvore mostra isso ANTES de a pessoa tentar.
    const arvore = await plano.montar(escopo);
    const categoria = arvore.grupos.flatMap((g) => g.contas).flatMap((c) => c.categorias).find((c) => c.id === emUso);
    expect(categoria?.usos).toBe(1);
    expect(categoria?.podeExcluir).toBe(false);
  });

  it("INATIVAR e o caminho para a categoria usada: ela some dos formularios e fica no historico", async () => {
    const arvore = await plano.montar(escopo);
    const emUso = arvore.grupos.flatMap((g) => g.contas).flatMap((c) => c.categorias).find((c) => c.usos > 0)!;

    await plano.alterarSituacaoCategoria(escopo, emUso.id, false, usuarioId);

    const depois = await plano.montar(escopo);
    const mesma = depois.grupos.flatMap((g) => g.contas).flatMap((c) => c.categorias).find((c) => c.id === emUso.id);
    expect(mesma?.ativa).toBe(false);
    // Continua existindo, com o uso intacto: nada foi apagado.
    expect(mesma?.usos).toBe(1);

    const [titulo] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM titulos_pagar WHERE categoria_id = ${emUso.id}
    `);
    expect(Number(titulo!.n)).toBe(1);

    await plano.alterarSituacaoCategoria(escopo, emUso.id, true, usuarioId);
  });

  it("conta com categorias nao pode ser excluida", async () => {
    const arvore = await plano.montar(escopo);
    const comCategorias = arvore.grupos.flatMap((g) => g.contas).find((c) => c.categorias.length > 0)!;
    expect(comCategorias.podeExcluir).toBe(false);
    await expect(plano.excluirConta(escopo, comCategorias.id, usuarioId)).rejects.toBeInstanceOf(ContaEmUso);
  });

  it("inativar a conta inativa as categorias dela", async () => {
    const { contaId } = await plano.criarConta(escopo, { codigo: "7.3.01", nome: "Conta a desligar", grupoDre: "despesa_operacional" }, usuarioId);
    await plano.criarCategoria(escopo, { nome: "Categoria que vai junto", contaPlanoId: contaId }, usuarioId);

    await plano.alterarSituacaoConta(escopo, contaId, false, usuarioId);

    const arvore = await plano.montar(escopo);
    const conta = arvore.grupos.flatMap((g) => g.contas).find((c) => c.id === contaId)!;
    expect(conta.ativa).toBe(false);
    expect(conta.categorias.every((c) => !c.ativa)).toBe(true);
  });

  it("toda alteracao do plano fica na auditoria", async () => {
    const [linha] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM eventos_auditoria
      WHERE empresa_id = ${cenario.empresaId} AND acao LIKE 'conta_plano.%' OR acao LIKE 'categoria.%'
    `);
    expect(Number(linha!.n)).toBeGreaterThan(0);
  });

  it("uma empresa nao enxerga o plano da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra: EscopoEmpresa = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      const arvore = await plano.montar(escopoOutra);
      const codigos = arvore.grupos.flatMap((g) => g.contas).map((c) => c.codigo);
      expect(codigos).not.toContain("7.1.01");
    } finally {
      await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${outra.empresaId}`);
      await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${outra.empresaId}`);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
