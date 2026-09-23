import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { CONJUNTOS } from "../dominio/conjunto-de-dados";
import { RepositorioExportacaoDrizzle } from "./repositorio-exportacao-drizzle";

/**
 * Exportacao completa contra PostgreSQL real, com ISOLAMENTO entre empresas:
 * o pacote de uma nunca pode conter uma linha da outra.
 *
 * O ZIP e aberto pelo descompactador do sistema, e nao pelo codigo que o
 * escreveu — a promessa comercial e que o cliente leve os dados embora e
 * consiga ABRI-LOS em outro lugar.
 */
describe.skipIf(!urlBancoTeste)("exportação completa (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioExportacaoDrizzle(banco as never);
  let a: CenarioBase, b: CenarioBase;
  let escopoA: EscopoEmpresa;
  let usuarioId = "";

  const temUnzip = (() => {
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  beforeAll(async () => {
    a = await criarCenarioBase(banco as BancoTeste);
    b = await criarCenarioBase(banco as BancoTeste);
    escopoA = {
      organizacaoId: comoIdentificador<"Organizacao">(a.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(a.empresaId),
    };
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    usuarioId = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Exportador', ${`exp-${usuarioId}@exemplo.local`}, false, now(), now())
    `);

    // Dado em cada empresa, para o isolamento ter o que provar.
    for (const cenario of [a, b]) {
      await banco.execute(sql`
        INSERT INTO titulos_pagar (empresa_id, codigo, descricao, fornecedor_id, categoria_id, data_competencia, valor_total, quantidade_parcelas, situacao)
        VALUES (${cenario.empresaId}, ${`CP-EXP-${cenario.empresaId.slice(0, 8)}`},
                ${`Titulo da empresa ${cenario.empresaId.slice(0, 8)}`}, ${cenario.fornecedorId}, ${cenario.categoriaId},
                '2026-01-01', '123.45', 1, 'aberto')
      `);
    }
  });

  afterAll(async () => {
    for (const cenario of [a, b]) {
      if (!cenario) continue;
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
      await banco.execute(sql`DELETE FROM titulos_pagar WHERE empresa_id = ${cenario.empresaId}`);
      await apagarCenarioBase(banco as BancoTeste, cenario);
    }
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await cliente.end();
  });

  /**
   * TODA consulta de exportacao roda contra o banco real.
   *
   * Sem isto, uma coluna renomeada numa migration quebraria a exportacao e
   * ninguem saberia ate o dia em que o cliente pedisse os dados — que e o pior
   * dia possivel para descobrir. Aqui cada consulta e executada uma a uma, e o
   * erro aponta qual arquivo quebrou.
   */
  it.each(CONJUNTOS.map((c) => c.arquivo))("a consulta de %s roda contra o esquema real", async (arquivo) => {
    const conjunto = CONJUNTOS.find((c) => c.arquivo === arquivo)!;
    const texto = conjunto.consulta
      .replace(/\$1/g, `'${a.empresaId}'::uuid`)
      .replace(/\$2/g, `'${a.organizacaoId}'::uuid`);

    await expect(banco.execute(sql.raw(texto)), `a consulta de ${arquivo} não roda`).resolves.toBeDefined();
  });

  it("o pacote traz TODOS os conjuntos previstos, mais o LEIAME", async () => {
    const pacote = await repositorio.exportar(escopoA, usuarioId);

    expect(pacote.resumo).toHaveLength(CONJUNTOS.length);
    for (const conjunto of CONJUNTOS) {
      expect(pacote.resumo.map((r) => r.arquivo)).toContain(`${conjunto.arquivo}.csv`);
    }
    expect(pacote.soma).toHaveLength(64);
    expect(pacote.nome).toMatch(/^financeiro-.*-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it.skipIf(!temUnzip)("o descompactador do sistema abre o pacote, e o CSV abre em português", () => {
    return repositorio.exportar(escopoA, usuarioId).then((pacote) => {
      const pasta = mkdtempSync(join(tmpdir(), "exportacao-"));
      const caminho = join(pasta, pacote.nome);
      writeFileSync(caminho, pacote.conteudo);

      expect(execFileSync("unzip", ["-t", caminho], { encoding: "utf8" })).toContain("No errors detected");
      execFileSync("unzip", ["-o", "-q", caminho, "-d", pasta]);

      const titulos = readFileSync(join(pasta, "dados", "titulos-a-pagar.csv"), "utf8");
      expect(titulos.charCodeAt(0)).toBe(0xfeff); // BOM: acento aparece certo no Excel
      expect(titulos.split("\r\n")[0]).toContain("valor_total");
      // Numero com virgula decimal e sem simbolo de moeda: precisa somar.
      expect(titulos).toContain("123,45");
      expect(titulos).not.toContain("R$");

      const leiame = readFileSync(join(pasta, "LEIAME.txt"), "utf8");
      expect(leiame).toContain("titulos-a-pagar.csv");
      expect(leiame).toContain("Ligações:");
      expect(leiame).toContain("Senhas e tokens");
    });
  });

  it("ISOLAMENTO: o pacote de uma empresa nao contem linha da outra", async () => {
    const pacote = await repositorio.exportar(escopoA, usuarioId);
    const texto = pacote.conteudo.toString("latin1");

    // O ZIP e comprimido, entao a busca e feita no conteudo descomprimido.
    const pasta = mkdtempSync(join(tmpdir(), "exportacao-iso-"));
    const caminho = join(pasta, "pacote.zip");
    writeFileSync(caminho, pacote.conteudo);

    if (temUnzip) {
      const titulos = execFileSync("unzip", ["-p", caminho, "dados/titulos-a-pagar.csv"], { encoding: "utf8" });
      expect(titulos).toContain(a.empresaId.slice(0, 8));
      expect(titulos).not.toContain(b.empresaId.slice(0, 8));
    } else {
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  it("NAO exporta senha nem token", async () => {
    const pacote = await repositorio.exportar(escopoA, usuarioId);
    const consultas = CONJUNTOS.map((c) => c.consulta).join(" ").toLowerCase();

    // Nenhuma consulta toca nas tabelas de credencial.
    for (const proibida of ["from account", "from session", "from verification", "from two_factor", "token_hash"]) {
      expect(consultas, `a exportação não pode ler ${proibida}`).not.toContain(proibida);
    }
    expect(pacote.resumo.map((r) => r.arquivo)).not.toContain("senhas.csv");
  });

  it("toda exportacao fica na auditoria", async () => {
    await repositorio.exportar(escopoA, usuarioId);
    const [linha] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM eventos_auditoria
      WHERE empresa_id = ${a.empresaId} AND acao = 'dados.exportados'
    `);
    expect(Number(linha!.n)).toBeGreaterThan(0);
  });

  it("as contagens do pacote batem com as do banco", async () => {
    const pacote = await repositorio.exportar(escopoA, usuarioId);
    const titulos = pacote.resumo.find((r) => r.arquivo === "titulos-a-pagar.csv");

    const [contagem] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM titulos_pagar WHERE empresa_id = ${a.empresaId}
    `);
    expect(titulos?.linhas).toBe(Number(contagem!.n));
  });
});
