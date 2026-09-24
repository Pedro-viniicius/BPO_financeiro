import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, codigoErroPostgres, criarBancoTeste, criarCenarioBase, ERRO_POSTGRES, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";

import { hashDoTokenDeCaptura } from "../dominio/token-captura";
import { RepositorioCapturaDrizzle } from "./repositorio-captura-drizzle";

/**
 * Tokens de captura contra PostgreSQL real, com DUAS empresas.
 *
 * ISOLAMENTO (controle 3 do ADR-017): o token de A nunca aparece para B, e
 * revogar em B nunca toca o de A. E a tensao da ADR-033: o token FABRICA um
 * escopo, e este teste prova que ele fabrica o escopo certo — e so ele.
 */
describe.skipIf(!urlBancoTeste)("tokens de captura: isolamento entre empresas (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();
  const repositorio = new RepositorioCapturaDrizzle(banco as never);
  let cenarioA: CenarioBase;
  let cenarioB: CenarioBase;
  let escopoA: EscopoEmpresa;
  let escopoB: EscopoEmpresa;
  let usuarioId = "";

  const escopoDe = (cenario: CenarioBase): EscopoEmpresa => ({
    organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
    empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
  });

  beforeAll(async () => {
    cenarioA = await criarCenarioBase(banco as BancoTeste);
    cenarioB = await criarCenarioBase(banco as BancoTeste);
    escopoA = escopoDe(cenarioA);
    escopoB = escopoDe(cenarioB);
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    usuarioId = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${usuarioId}, 'Teste Captura', ${`captura-${usuarioId}@exemplo.local`}, false, now(), now())
    `);
  });

  const id0 = () => crypto.randomUUID();

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE usuario_id = ${usuarioId} OR empresa_id IN (${escopoA.empresaId}, ${escopoB.empresaId})`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM anexos_documentos_capturados WHERE documento_id IN (SELECT id FROM documentos_capturados WHERE empresa_id IN (${escopoA.empresaId}, ${escopoB.empresaId}))`);
    await banco.execute(sql`DELETE FROM documentos_capturados WHERE empresa_id IN (${escopoA.empresaId}, ${escopoB.empresaId})`);
    await banco.execute(sql`DELETE FROM arquivos WHERE empresa_id IN (${escopoA.empresaId}, ${escopoB.empresaId})`);
    await banco.execute(sql`DELETE FROM sequencias_codigo WHERE empresa_id IN (${escopoA.empresaId}, ${escopoB.empresaId})`);
    await banco.execute(sql`DELETE FROM tokens_captura WHERE criado_por = ${usuarioId}`);
    await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    await apagarCenarioBase(banco as BancoTeste, cenarioA);
    await apagarCenarioBase(banco as BancoTeste, cenarioB);
    await cliente.end();
  });

  it("o token de A resolve o escopo de A, e B nao enxerga token nenhum", async () => {
    const hashA = hashDoTokenDeCaptura("token-da-empresa-A-000");
    const { substituiuAnterior } = await repositorio.gerarToken(escopoA, { tokenHash: hashA, autorUsuarioId: usuarioId });
    expect(substituiuAnterior).toBe(false);

    expect(await repositorio.obterTokenAtivo(escopoB)).toBeNull();
    const ativoA = await repositorio.obterTokenAtivo(escopoA);
    expect(ativoA?.limiteEnviosHora).toBe(20);
    expect(ativoA).not.toHaveProperty("tokenHash");

    const resolvido = await repositorio.resolverEscopoPorToken(hashA);
    expect(resolvido?.escopo).toEqual(escopoA);
    expect(resolvido?.escopo.empresaId).not.toBe(escopoB.empresaId);
  });

  it("revogar em B nao toca o token de A", async () => {
    expect(await repositorio.revogarToken(escopoB, { autorUsuarioId: usuarioId })).toBe(false);
    expect(await repositorio.obterTokenAtivo(escopoA)).not.toBeNull();
  });

  it("gerar de novo em A revoga o anterior na mesma transacao: so um ativo, e o antigo nao resolve mais", async () => {
    const hashAntigo = hashDoTokenDeCaptura("token-da-empresa-A-000");
    const hashNovo = hashDoTokenDeCaptura("token-da-empresa-A-001");
    const { substituiuAnterior } = await repositorio.gerarToken(escopoA, { tokenHash: hashNovo, autorUsuarioId: usuarioId });
    expect(substituiuAnterior).toBe(true);

    expect(await repositorio.resolverEscopoPorToken(hashAntigo)).toBeNull();
    expect((await repositorio.resolverEscopoPorToken(hashNovo))?.escopo).toEqual(escopoA);

    const [contagem] = await banco.execute<{ ativos: number; total: number }>(sql`
      SELECT count(*) FILTER (WHERE revogado_em IS NULL)::int AS ativos, count(*)::int AS total
      FROM tokens_captura WHERE empresa_id = ${escopoA.empresaId}
    `);
    expect(contagem).toEqual({ ativos: 1, total: 2 });
  });

  it("o banco recusa dois tokens ativos na mesma empresa, mesmo por fora do repositorio", async () => {
    let codigo: string | undefined;
    try {
      await banco.execute(sql`
        INSERT INTO tokens_captura (empresa_id, token_hash, criado_por)
        VALUES (${escopoA.empresaId}, ${hashDoTokenDeCaptura("intruso")}, ${usuarioId})
      `);
    } catch (erro) {
      codigo = codigoErroPostgres(erro);
    }
    expect(codigo).toBe(ERRO_POSTGRES.violacaoUnicidade);
  });

  it("a trilha registrou gerado, revogado (substituido) e gerado — sem nenhum hash", async () => {
    const eventos = await banco.execute<{ acao: string; dados_depois: Record<string, unknown> }>(sql`
      SELECT acao, dados_depois FROM eventos_auditoria
      WHERE usuario_id = ${usuarioId} AND empresa_id = ${escopoA.empresaId} ORDER BY ocorrido_em
    `);
    expect(eventos.map((e) => e.acao)).toEqual(["qr_captura.gerado", "qr_captura.revogado", "qr_captura.gerado"]);
    expect(JSON.stringify(eventos)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("um documento recebido por A nao aparece na contagem de B, e o arquivo de A nao e reaproveitado por B", async () => {
    const resolvido = await repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura("token-da-empresa-A-001"));
    const impressao = "a".repeat(64);
    const { id, codigo } = await repositorio.receberDocumento(escopoA, {
      tokenId: resolvido!.tokenId,
      ano: 2026,
      observacao: "nota do fornecedor",
      arquivos: [{ novo: { chaveArmazenamento: `${escopoA.empresaId}/2026/09/${id0()}.bin`, nomeOriginal: "nota.jpg", tipoConteudo: "image/jpeg", tamanhoBytes: 10, impressaoDigital: impressao } }],
      remetente: { ipAnonimo: "v1:" + "b".repeat(64), agenteUsuario: "teste" },
    });
    expect(codigo).toMatch(/^DC-2026-\d{6}$/);

    expect(await repositorio.contarPendentes(escopoA)).toBe(1);
    expect(await repositorio.contarPendentes(escopoB)).toBe(0);
    expect(await repositorio.procurarArquivoPorImpressao(escopoA, impressao)).not.toBeNull();
    expect(await repositorio.procurarArquivoPorImpressao(escopoB, impressao)).toBeNull();

    const [evento] = await banco.execute<{ origem: string; ip: string | null; usuario_id: string | null }>(sql`
      SELECT origem, ip, usuario_id FROM eventos_auditoria WHERE entidade_id = ${id}
    `);
    expect(evento).toEqual({ origem: "captura_publica", ip: "v1:" + "b".repeat(64), usuario_id: null });
  });

  it("revogar em A mata o token: nada resolve, nada ativo", async () => {
    expect(await repositorio.revogarToken(escopoA, { autorUsuarioId: usuarioId })).toBe(true);
    expect(await repositorio.obterTokenAtivo(escopoA)).toBeNull();
    expect(await repositorio.resolverEscopoPorToken(hashDoTokenDeCaptura("token-da-empresa-A-001"))).toBeNull();
  });
});
