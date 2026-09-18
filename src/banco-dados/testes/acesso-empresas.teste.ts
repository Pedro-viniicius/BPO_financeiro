import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import * as esquema from "@/banco-dados/esquemas/indice";
import { comoIdentificador, type IdUsuario } from "@/compartilhado/tipos/identificadores";
import { instalarPrimeiraEmpresa, RepositorioAcessoEmpresasDrizzle, trocarEmpresaAtiva } from "@/nucleo/empresas/publico";

import { criarBancoTeste, ERRO_POSTGRES, esperarErroPostgres, urlBancoTeste } from "./apoio-testes-banco";

/**
 * Isolamento entre empresas e instalacao da primeira empresa no PostgreSQL
 * real (Gate 5). Cobre o que o fake em memoria nao prova: a consulta SQL de
 * empresas acessiveis, o lock consultivo contra instalacoes simultaneas, a
 * unicidade com NULLS NOT DISTINCT e o enum de papeis.
 *
 * Os testes de instalacao confirmam transacoes de verdade (o lock exige
 * isso), entao limpam o que criaram no fim. Os eventos de auditoria gerados
 * permanecem: a trilha e somente insercao por definicao (ADR-008).
 */
describe.skipIf(!urlBancoTeste)("acesso a empresas e instalacao (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste(8);
  const repositorio = new RepositorioAcessoEmpresasDrizzle(banco);
  const usuariosCriados: string[] = [];

  afterAll(async () => {
    for (const usuarioId of usuariosCriados) {
      await banco.execute(sql`DELETE FROM vinculos_usuario WHERE usuario_id = ${usuarioId}`);
      await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`);
    }
    await banco.execute(sql`DELETE FROM empresas WHERE nome LIKE 'Teste G5 %'`);
    await banco.execute(sql`DELETE FROM organizacoes WHERE nome LIKE 'Teste G5 %'`);
    await cliente.end();
  });

  async function criarUsuario(nome: string): Promise<IdUsuario> {
    const [linha] = await banco
      .insert(esquema.user)
      .values({ name: nome, email: `${nome.toLowerCase().replace(/\W/g, "-")}-${crypto.randomUUID().slice(0, 8)}@teste.local` })
      .returning({ id: esquema.user.id });
    usuariosCriados.push(linha!.id);
    return comoIdentificador<"Usuario">(linha!.id);
  }

  it("instala a primeira empresa: organizacao + empresa + vinculo administrador, tudo confirmado junto", async () => {
    const usuarioA = await criarUsuario("Teste G5 A");

    const resultado = await instalarPrimeiraEmpresa(repositorio, { usuarioId: usuarioA, origem: "interface" }, { nome: "Teste G5 Empresa A" });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;
    const acessiveis = await repositorio.listarEmpresasAcessiveis(usuarioA);
    expect(acessiveis).toHaveLength(1);
    expect(acessiveis[0]).toMatchObject({ empresaId: resultado.valor.empresaId, papel: "administrador", acessoPelaOrganizacao: false });
  });

  it("isolamento: A nao enxerga nem ativa a empresa de B, e vice-versa", async () => {
    const usuarioA = await criarUsuario("Teste G5 Iso A");
    const usuarioB = await criarUsuario("Teste G5 Iso B");
    const instalacaoA = await instalarPrimeiraEmpresa(repositorio, { usuarioId: usuarioA, origem: "interface" }, { nome: "Teste G5 Iso Empresa A" });
    const instalacaoB = await instalarPrimeiraEmpresa(repositorio, { usuarioId: usuarioB, origem: "interface" }, { nome: "Teste G5 Iso Empresa B" });
    if (!instalacaoA.sucesso || !instalacaoB.sucesso) throw new Error("cenario nao montado");

    expect((await repositorio.listarEmpresasAcessiveis(usuarioA)).map((e) => e.empresaId)).toEqual([instalacaoA.valor.empresaId]);
    expect((await repositorio.listarEmpresasAcessiveis(usuarioB)).map((e) => e.empresaId)).toEqual([instalacaoB.valor.empresaId]);

    const tentativa = await trocarEmpresaAtiva(repositorio, usuarioA, instalacaoB.valor.empresaId);
    expect(tentativa.sucesso).toBe(false);
  });

  it("duas instalacoes simultaneas do mesmo usuario: exatamente uma empresa e criada", async () => {
    const usuario = await criarUsuario("Teste G5 Concorrente");

    const resultados = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        instalarPrimeiraEmpresa(repositorio, { usuarioId: usuario, origem: "interface" }, { nome: `Teste G5 Concorrente ${i}` }),
      ),
    );

    expect(resultados.filter((r) => r.sucesso)).toHaveLength(1);
    expect(resultados.filter((r) => !r.sucesso && r.erro.codigo === "usuario_ja_possui_empresa")).toHaveLength(3);
    expect(await repositorio.listarEmpresasAcessiveis(usuario)).toHaveLength(1);
  });

  it("vinculo revogado (ativo = false) some da lista de acessiveis na hora", async () => {
    const usuario = await criarUsuario("Teste G5 Revogado");
    const instalacao = await instalarPrimeiraEmpresa(repositorio, { usuarioId: usuario, origem: "interface" }, { nome: "Teste G5 Revogada" });
    if (!instalacao.sucesso) throw new Error("cenario nao montado");

    await banco.execute(sql`UPDATE vinculos_usuario SET ativo = false WHERE usuario_id = ${usuario}`);

    expect(await repositorio.listarEmpresasAcessiveis(usuario)).toEqual([]);
    expect((await trocarEmpresaAtiva(repositorio, usuario, instalacao.valor.empresaId)).sucesso).toBe(false);
  });

  it("vinculo 'toda a organizacao' expande para as empresas ativas do grupo", async () => {
    const usuario = await criarUsuario("Teste G5 Grupo");
    await banco.transaction(async (tx) => {
      const [org] = await tx.insert(esquema.organizacoes).values({ nome: "Teste G5 Grupo" }).returning();
      await tx.insert(esquema.empresas).values([
        { organizacaoId: org!.id, nome: "Teste G5 Grupo Padaria" },
        { organizacaoId: org!.id, nome: "Teste G5 Grupo Distribuidora" },
        { organizacaoId: org!.id, nome: "Teste G5 Grupo Inativa", ativa: false },
      ]);
      await tx.insert(esquema.vinculosUsuario).values({ usuarioId: usuario, organizacaoId: org!.id, empresaId: null, papel: "controladoria" });
    });

    const acessiveis = await repositorio.listarEmpresasAcessiveis(usuario);
    expect(acessiveis.map((e) => e.nome).sort()).toEqual(["Teste G5 Grupo Distribuidora", "Teste G5 Grupo Padaria"]);
    expect(acessiveis.every((e) => e.papel === "controladoria" && e.acessoPelaOrganizacao)).toBe(true);
  });

  it("o banco recusa papel desconhecido e vinculo duplicado (inclusive dois 'toda a organizacao')", async () => {
    const usuario = await criarUsuario("Teste G5 Restricoes");
    await banco.transaction(async (tx) => {
      const [org] = await tx.insert(esquema.organizacoes).values({ nome: "Teste G5 Restricoes" }).returning();

      await esperarErroPostgres(
        tx,
        () => tx.execute(sql`INSERT INTO vinculos_usuario (usuario_id, organizacao_id, papel) VALUES (${usuario}, ${org!.id}, 'dono')`),
        "22P02", // invalid_text_representation: valor fora do enum
      );

      await tx.insert(esquema.vinculosUsuario).values({ usuarioId: usuario, organizacaoId: org!.id, empresaId: null, papel: "financeiro" });
      await esperarErroPostgres(
        tx,
        () => tx.insert(esquema.vinculosUsuario).values({ usuarioId: usuario, organizacaoId: org!.id, empresaId: null, papel: "auditor" }),
        ERRO_POSTGRES.violacaoUnicidade,
      );
      throw new DescartarCenario();
    }).catch((erro: unknown) => {
      if (!(erro instanceof DescartarCenario)) throw erro;
    });
  });

  it("falha dentro da instalacao nao deixa empresa nem vinculo pela metade", async () => {
    const usuario = await criarUsuario("Teste G5 Falha");
    // Escrita real (transacao do PostgreSQL) cujo ultimo passo lanca, depois
    // de organizacao, empresa e vinculo ja terem sido inseridos na transacao.
    const unidadeComFalha = {
      executarAtomicamente: <T,>(operacao: Parameters<typeof repositorio.executarAtomicamente<T>>[0]) =>
        repositorio.executarAtomicamente<T>((escrita) =>
          operacao({
            ...escrita,
            travarUsuarioParaInstalacao: escrita.travarUsuarioParaInstalacao.bind(escrita),
            contarVinculosAtivos: escrita.contarVinculosAtivos.bind(escrita),
            cnpjJaExiste: escrita.cnpjJaExiste.bind(escrita),
            criarOrganizacao: escrita.criarOrganizacao.bind(escrita),
            criarEmpresa: escrita.criarEmpresa.bind(escrita),
            criarVinculo: escrita.criarVinculo.bind(escrita),
            registrarAuditoria: async () => {
              throw new Error("falha proposital apos criar empresa e vinculo");
            },
          }),
        ),
    };

    await expect(
      instalarPrimeiraEmpresa(unidadeComFalha, { usuarioId: usuario, origem: "interface" }, { nome: "Teste G5 Falha Empresa" }),
    ).rejects.toThrow("falha proposital");

    expect(await repositorio.listarEmpresasAcessiveis(usuario)).toEqual([]);
    const [empresa] = await banco.execute(sql`SELECT id FROM empresas WHERE nome = 'Teste G5 Falha Empresa'`);
    expect(empresa).toBeUndefined();
  });
});

class DescartarCenario extends Error {}
