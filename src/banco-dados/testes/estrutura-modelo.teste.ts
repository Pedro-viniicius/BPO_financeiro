import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { criarBancoTeste, urlBancoTeste } from "./apoio-testes-banco";

/**
 * Verificacoes estruturais: o banco aplicado corresponde as regras do modelo
 * (docs/modelo-dados/padrao-nomenclatura.md e pertencimento-dados.md).
 * Se alguem criar uma tabela financeira sem empresa_id, ou um valor em
 * float, este teste falha.
 */
const TABELAS_FINANCEIRAS_COM_EMPRESA = [
  "clientes",
  "fornecedores",
  "contas_bancarias",
  "categorias_financeiras",
  "contas_plano",
  "centros_custo",
  "titulos_pagar",
  "parcelas_pagar",
  "pagamentos",
  "recorrencias_pagar",
  "titulos_receber",
  "parcelas_receber",
  "recebimentos",
  "recorrencias_receber",
  "contatos_cobranca",
  "movimentacoes_bancarias",
  "transferencias",
  "extratos_bancarios",
  "conciliacoes_bancarias",
  "dividas",
  "parcelas_divida",
  "pagamentos_divida",
  "orcamentos",
  "arquivos",
  "sequencias_codigo",
  // Captura de documentos (Gate 10). `tentativas_captura` fica de fora de
  // proposito: e controle tecnico sem empresa — ver o cabecalho da migracao 0010.
  "tokens_captura",
  "documentos_capturados",
];

describe.skipIf(!urlBancoTeste)("estrutura do modelo (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste(2);
  afterAll(async () => cliente.end());

  it("todas as migracoes do diario foram aplicadas, na ordem", async () => {
    const diario = JSON.parse(readFileSync("src/banco-dados/migracoes/meta/_journal.json", "utf8")) as { entries: unknown[] };
    const [linha] = await banco.execute<{ total: string }>(sql`SELECT count(*)::text AS total FROM migracoes_aplicadas`);
    expect(Number(linha?.total)).toBe(diario.entries.length);
  });

  it("toda tabela financeira tem empresa_id (isolamento por empresa)", async () => {
    const linhas = await banco.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'empresa_id'
    `);
    const comEmpresa = new Set(linhas.map((l) => l.table_name));
    const faltando = TABELAS_FINANCEIRAS_COM_EMPRESA.filter((t) => !comEmpresa.has(t));
    expect(faltando).toEqual([]);
  });

  it("toda coluna valor_* e NUMERIC(15,2); nenhuma coluna monetaria usa float", async () => {
    const monetarias = await banco.execute<{ table_name: string; column_name: string; data_type: string; numeric_precision: number; numeric_scale: number }>(sql`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND (column_name LIKE 'valor%' OR column_name LIKE 'saldo%')
    `);
    expect(monetarias.length).toBeGreaterThan(20);
    for (const coluna of monetarias) {
      expect(`${coluna.table_name}.${coluna.column_name}: ${coluna.data_type}(${coluna.numeric_precision},${coluna.numeric_scale})`).toBe(
        `${coluna.table_name}.${coluna.column_name}: numeric(15,2)`,
      );
    }
    const flutuantes = await banco.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('real', 'double precision')
    `);
    expect(flutuantes).toEqual([]);
  });

  it("colunas data_* sao DATE e colunas *_em sao TIMESTAMPTZ (datas de negocio x instantes tecnicos)", async () => {
    const datas = await banco.execute<{ table_name: string; column_name: string; data_type: string }>(sql`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name LIKE 'data\\_%'
    `);
    for (const coluna of datas) {
      expect(`${coluna.table_name}.${coluna.column_name}: ${coluna.data_type}`).toBe(`${coluna.table_name}.${coluna.column_name}: date`);
    }
    const instantes = await banco.execute<{ table_name: string; column_name: string; data_type: string }>(sql`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name LIKE '%\\_em'
        AND table_name NOT IN ('user', 'session', 'account', 'verification', 'two_factor')
    `);
    expect(instantes.length).toBeGreaterThan(20);
    for (const coluna of instantes) {
      expect(`${coluna.table_name}.${coluna.column_name}: ${coluna.data_type}`).toBe(
        `${coluna.table_name}.${coluna.column_name}: timestamp with time zone`,
      );
    }
  });

  it("nenhuma tabela do projeto usa nomes em ingles nas colunas (fora das tabelas do Better Auth)", async () => {
    const suspeitas = await banco.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name NOT IN ('user', 'session', 'account', 'verification', 'two_factor', 'migracoes_aplicadas')
        AND (column_name LIKE 'created%' OR column_name LIKE 'updated%' OR column_name LIKE '%amount' OR column_name LIKE '%\\_status'
             OR column_name = 'status' OR column_name LIKE '%\\_date' OR column_name = 'date' OR column_name = 'name' OR column_name LIKE '%\\_name')
    `);
    expect(suspeitas).toEqual([]);
  });

  /**
   * CASCADE e proibido em tabela financeira: apagar um registro nunca pode
   * levar dinheiro junto em silencio. As excecoes sao tabelas `itens_X` que
   * nao existem sozinhas — o item pertence inteiramente ao pai, e mante-lo
   * depois que o pai sai deixaria linha orfa sem significado:
   *
   *   itens_extrato_bancario   linhas de um arquivo de extrato importado
   *   itens_orcamento          celulas de um orcamento
   *   itens_lote_importacao    o que uma importacao criou (Gate 9)
   *
   * Acrescentar uma quarta exige a mesma pergunta: este item significa
   * alguma coisa sem o pai? Se significar, e RESTRICT.
   */
  it("toda chave estrangeira de tabela financeira usa RESTRICT ou SET NULL, exceto as excecoes documentadas (CASCADE)", async () => {
    const cascatas = await banco.execute<{ table_name: string; constraint_name: string }>(sql`
      SELECT tc.table_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY' AND rc.delete_rule = 'CASCADE'
        AND tc.table_name NOT IN ('session', 'account', 'two_factor', 'vinculos_usuario')
    `);
    expect(cascatas.map((c) => c.table_name).sort()).toEqual([
      "itens_extrato_bancario",
      "itens_lote_importacao",
      "itens_orcamento",
    ]);
  });
});
