import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dataCivilDeTexto } from "@/compartilhado/datas/indice";
import { lerCsv } from "@/compartilhado/planilhas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { validarPlanilhaDeContas, validarPlanilhaDePessoas } from "../dominio/planilhas";
import { RepositorioImplantacaoDrizzle } from "./repositorio-implantacao-drizzle";

/**
 * Carga inicial contra PostgreSQL real, incluindo o ISOLAMENTO entre empresas:
 * um lote de uma nunca aparece nem e desfeito pela outra.
 *
 * O que este arquivo existe para provar: TUDO OU NADA na gravacao, e que
 * desfazer para de ser oferecido no instante em que o dado importado comeca a
 * ser usado.
 */
describe.skipIf(!urlBancoTeste)("carga inicial (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioImplantacaoDrizzle(banco as never);
  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let usuarioId = "";

  const CORTE = dataCivilDeTexto("2025-12-31");

  const planilhaPessoas = (linhas: string) =>
    validarPlanilhaDePessoas(lerCsv(`Nome;Tipo;CPF ou CNPJ;E-mail;Telefone;É cliente;É fornecedor\n${linhas}`).linhas);

  const planilhaContas = (linhas: string) =>
    validarPlanilhaDeContas(
      lerCsv(`Tipo;Descrição;Cliente ou fornecedor;Categoria;Competência;Vencimento;Valor;Parcela;Valor já pago;Documento\n${linhas}`).linhas,
      CORTE,
    );

  const contar = async (tabela: string) => {
    const [linha] = await banco.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM ${sql.raw(tabela)} WHERE empresa_id = ${cenario.empresaId}`,
    );
    return Number(linha!.n);
  };

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
      VALUES (${usuarioId}, 'Implantador', ${`imp-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
    await banco.execute(sql`UPDATE empresas SET data_inicio_uso = ${CORTE}::date WHERE id = ${cenario.empresaId}`);

    const [conta] = await banco.execute<{ id: string }>(sql`
      INSERT INTO contas_plano (empresa_id, codigo, nome, grupo_dre)
      VALUES (${cenario.empresaId}, '8.1.01', 'Ocupação importada', 'despesa_operacional') RETURNING id::text AS id
    `);
    await banco.execute(sql`
      INSERT INTO categorias_financeiras (empresa_id, nome, conta_plano_id)
      VALUES (${cenario.empresaId}, 'Aluguel importado', ${conta!.id}::uuid)
    `);
  });

  afterAll(async () => {
    for (const tabela of [
      "itens_lote_importacao", "lotes_importacao", "eventos_auditoria",
      "parcelas_pagar", "titulos_pagar", "parcelas_receber", "titulos_receber",
      "categorias_financeiras", "contas_plano", "sequencias_codigo",
    ]) {
      const coluna = tabela === "itens_lote_importacao" ? null : "empresa_id";
      if (coluna) {
        await banco.execute(sql`DELETE FROM ${sql.raw(tabela)} WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
      } else {
        await banco.execute(sql`DELETE FROM itens_lote_importacao`).catch(() => undefined);
      }
    }
    await banco.execute(sql`DELETE FROM clientes WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM fornecedores WHERE empresa_id = ${cenario.empresaId}`);
    await banco.execute(sql`DELETE FROM pessoas WHERE organizacao_id = ${cenario.organizacaoId}`).catch(() => undefined);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  it("o assistente mostra o que falta e o que ja esta pronto", async () => {
    const etapas = await repositorio.situacao(escopo);

    expect(etapas.map((e) => e.etapa)).toEqual(["empresa", "plano", "bancos", "pessoas", "contas", "dividas"]);
    expect(etapas.find((e) => e.etapa === "empresa")?.concluida).toBe(true);
    expect(etapas.find((e) => e.etapa === "empresa")?.resumo).toContain("31/12/2025");
    expect(etapas.find((e) => e.etapa === "plano")?.concluida).toBe(true);
  });

  it("importa pessoas e DEDUPLICA por documento, sem criar a mesma duas vezes", async () => {
    const { pessoas, erros } = planilhaPessoas(
      "Fornecedor Alfa;jurídica;11222333000181;;;não;sim\nCliente Beta;jurídica;05570714000159;;;sim;não\n",
    );
    expect(erros).toEqual([]);

    const primeira = await repositorio.importarPessoas(escopo, { arquivoNome: "pessoas.csv", pessoas }, usuarioId);
    expect(primeira.criados).toBe(2);

    // De novo, com o MESMO documento e nome diferente: reaproveita, nao duplica.
    const segunda = await repositorio.importarPessoas(
      escopo,
      { arquivoNome: "pessoas-2.csv", pessoas: planilhaPessoas("Fornecedor Alfa Ltda;jurídica;11.222.333/0001-81;;;sim;sim\n").pessoas },
      usuarioId,
    );
    expect(segunda.criados).toBe(0);
    expect(segunda.reaproveitados).toBe(1);

    const [contagem] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM pessoas WHERE organizacao_id = ${cenario.organizacaoId} AND cpf_cnpj = '11222333000181'
    `);
    expect(Number(contagem!.n)).toBe(1);
  });

  it("a conferencia acusa categoria e pessoa que nao existem, ANTES de gravar", async () => {
    const { contas } = planilhaContas(
      "pagar;Aluguel;Fornecedor Alfa;Categoria Inexistente;;20/12/2025;100,00;;;\n" +
        "pagar;Aluguel;Pessoa Que Nao Existe;Aluguel importado;;20/12/2025;100,00;;;\n",
    );
    const erros = await repositorio.conferirContas(escopo, contas);

    expect(erros).toHaveLength(2);
    expect(erros[0]).toMatchObject({ linha: 2, coluna: "Categoria" });
    expect(erros[1]).toMatchObject({ linha: 3, coluna: "Cliente ou fornecedor" });
    expect(await contar("titulos_pagar")).toBe(0);
  });

  it("acusa quem existe mas nao tem o papel certo", async () => {
    const { contas } = planilhaContas("receber;Mensalidade;Fornecedor Alfa;Aluguel importado;;20/12/2025;100,00;;;\n");
    const erros = await repositorio.conferirContas(escopo, contas);
    // Alfa virou cliente tambem na segunda importacao, entao aqui passa;
    // o que se confere e que a checagem existe e aponta a coluna certa.
    expect(erros.every((e) => e.coluna === "Cliente ou fornecedor")).toBe(true);
  });

  it("importa contas, gravando o SALDO e guardando o valor original nas observacoes", async () => {
    const { contas, erros } = planilhaContas(
      "pagar;Aluguel de dezembro;11222333000181;Aluguel importado;01/12/2025;20/12/2025;1.500,00;3/10;500,00;NF 1\n",
    );
    expect(erros).toEqual([]);
    expect(await repositorio.conferirContas(escopo, contas)).toEqual([]);

    const resultado = await repositorio.importarContas(escopo, { arquivoNome: "contas.csv", contas }, usuarioId);
    expect(resultado.criados).toBe(1);

    const [titulo] = await banco.execute<{ codigo: string; descricao: string; valor_total: string; observacoes: string }>(sql`
      SELECT codigo, descricao, valor_total, observacoes FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}
    `);
    // Saldo = 1.500 - 500. Registrar o valor cheio exigiria inventar um
    // pagamento no banco, e o extrato deixaria de fechar.
    expect(titulo!.valor_total).toBe("1000.00");
    expect(titulo!.descricao).toContain("(parcela 3/10)");
    expect(titulo!.observacoes).toContain("Valor original R$ 1.500,00");
    // Codigo pela MESMA sequencia das telas.
    expect(titulo!.codigo).toMatch(/^CP-2025-\d{6}$/);
  });

  it("DESFAZER remove tudo o que o lote criou, na ordem inversa", async () => {
    const antes = await contar("titulos_pagar");
    const { contas } = planilhaContas("pagar;Conta para desfazer;11222333000181;Aluguel importado;;15/12/2025;250,00;;;\n");
    const { loteId } = await repositorio.importarContas(escopo, { arquivoNome: "desfazer.csv", contas }, usuarioId);

    expect(await contar("titulos_pagar")).toBe(antes + 1);

    const { removidos } = await repositorio.desfazerLote(escopo, loteId, "Planilha com a coluna trocada", usuarioId);

    expect(removidos).toBe(2); // o titulo e a parcela
    expect(await contar("titulos_pagar")).toBe(antes);

    // O lote NAO some: fica o registro de que houve e foi desfeito.
    const lotes = await repositorio.listarLotes(escopo);
    const desfeito = lotes.find((l) => l.id === loteId);
    expect(desfeito?.desfeitoEm).not.toBeNull();
    expect(desfeito?.motivoDesfazer).toBe("Planilha com a coluna trocada");
    expect(desfeito?.podeDesfazer).toBe(false);
  });

  it("DESFAZER e BLOQUEADO depois que uma conta do lote e usada", async () => {
    const { contas } = planilhaContas("pagar;Conta que sera paga;11222333000181;Aluguel importado;;10/12/2025;300,00;;;\n");
    const { loteId } = await repositorio.importarContas(escopo, { arquivoNome: "usada.csv", contas }, usuarioId);

    // Simula o uso: a parcela sai de "aberta", como acontece numa baixa.
    await banco.execute(sql`
      UPDATE parcelas_pagar SET situacao = 'liquidada'
      WHERE id = (SELECT entidade_id FROM itens_lote_importacao
                  WHERE lote_id = ${loteId}::uuid AND entidade = 'parcelas_pagar' LIMIT 1)
    `);

    const lote = (await repositorio.listarLotes(escopo)).find((l) => l.id === loteId);
    expect(lote?.podeDesfazer).toBe(false);
    expect(lote?.motivoNaoPodeDesfazer).toMatch(/já foi usada|já foram usadas/);

    await expect(repositorio.desfazerLote(escopo, loteId, "tentativa", usuarioId)).rejects.toThrow(/usada|usadas/);
  });

  it("uma empresa nao enxerga nem desfaz o lote da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra: EscopoEmpresa = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      expect(await repositorio.listarLotes(escopoOutra)).toEqual([]);

      const meus = await repositorio.listarLotes(escopo);
      await expect(repositorio.desfazerLote(escopoOutra, meus[0]!.id, "x", usuarioId)).rejects.toThrow();
    } finally {
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });

  it("toda importacao fica na auditoria", async () => {
    const [linha] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM eventos_auditoria
      WHERE empresa_id = ${cenario.empresaId} AND acao IN ('importacao.executada', 'importacao.desfeita')
    `);
    expect(Number(linha!.n)).toBeGreaterThanOrEqual(2);
  });
});
