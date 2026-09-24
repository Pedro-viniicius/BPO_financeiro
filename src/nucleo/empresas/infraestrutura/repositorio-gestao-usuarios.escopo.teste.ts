import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import * as esquema from "@/banco-dados/esquemas/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";
import type { Credenciais, UsuarioDeAutenticacao } from "@/nucleo/autenticacao/publico";

import { RedefinicaoNaoPermitida, UsuarioNaoEncontradoNaEmpresa } from "../dominio/regras-de-acesso";
import { RepositorioGestaoDeUsuariosDrizzle } from "./repositorio-gestao-usuarios-drizzle";

/**
 * ESCOPO da gestao de usuarios: por EMPRESA, nao por organizacao.
 *
 * Duas coisas que esta suite prova contra PostgreSQL real:
 *
 * 1. Quem administra a empresa A, num grupo com a empresa B, nao altera papel,
 *    nao desativa e nao redefine o acesso de quem so existe em B — e a
 *    resposta e "nao encontrado nesta empresa", sem confirmar que a pessoa
 *    existe em B.
 * 2. O link de redefinicao nunca sai para uma conta que tambem serve a OUTRA
 *    organizacao: quem o tivesse entraria, como a pessoa, em lugares que nunca
 *    concederam acesso a quem pediu.
 */
describe.skipIf(!urlBancoTeste)("gestao de usuarios: escopo por empresa (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();

  const contas = new Map<string, UsuarioDeAutenticacao>();
  const credenciais: Credenciais = {
    async buscarPorEmail(email) {
      return contas.get(email.toLowerCase()) ?? null;
    },
    async criarUsuarioComSenha() {
      throw new Error("nao usado nesta suite");
    },
    async definirSenha() {
      /* nao usado */
    },
    async encerrarSessoes() {
      /* nao usado */
    },
  };

  const repositorio = new RepositorioGestaoDeUsuariosDrizzle(banco as never, credenciais);

  let cenario: CenarioBase;
  let outraOrganizacao: CenarioBase;
  let empresaBId = "";
  let escopoA: EscopoEmpresa;
  let escopoB: EscopoEmpresa;

  let adminDeA = "";
  let adminDeB = "";
  let usuarioSoDeB = "";
  let usuarioDeAEDeOutraOrg = "";
  const usuarios: string[] = [];

  const criarUsuario = async (nome: string, vinculos: readonly { organizacaoId: string; empresaId: string; papel: string }[]) => {
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    const id = linha!.id;
    const email = `${nome.toLowerCase().replace(/\s+/g, "-")}-${id.slice(0, 8)}@exemplo.local`;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${id}, ${nome}, ${email}, true, now(), now())
    `);
    for (const vinculo of vinculos) {
      await banco.execute(sql`
        INSERT INTO vinculos_usuario (usuario_id, organizacao_id, empresa_id, papel, ativo)
        VALUES (${id}, ${vinculo.organizacaoId}, ${vinculo.empresaId}, ${vinculo.papel}::papel_vinculo, true)
      `);
    }
    contas.set(email, { id, nome, email });
    usuarios.push(id);
    return id;
  };

  const papelEm = async (usuarioId: string, empresaId: string) => {
    const [linha] = await banco.execute<{ papel: string; ativo: boolean }>(sql`
      SELECT papel::text AS papel, ativo FROM vinculos_usuario WHERE usuario_id = ${usuarioId} AND empresa_id = ${empresaId}
    `);
    return linha ?? null;
  };

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    outraOrganizacao = await criarCenarioBase(banco as BancoTeste);

    // Segunda empresa NA MESMA organizacao do cenario: a "empresa irma".
    const [empresaB] = await banco
      .insert(esquema.empresas)
      .values({ organizacaoId: cenario.organizacaoId, nome: `Empresa B ${cenario.empresaId.slice(0, 8)}` })
      .returning();
    empresaBId = empresaB!.id;

    escopoA = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    escopoB = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(empresaBId),
    };

    adminDeA = await criarUsuario("Admin A", [{ organizacaoId: cenario.organizacaoId, empresaId: cenario.empresaId, papel: "administrador" }]);
    adminDeB = await criarUsuario("Admin B", [{ organizacaoId: cenario.organizacaoId, empresaId: empresaBId, papel: "administrador" }]);
    usuarioSoDeB = await criarUsuario("Operador B", [{ organizacaoId: cenario.organizacaoId, empresaId: empresaBId, papel: "somente_leitura" }]);
    usuarioDeAEDeOutraOrg = await criarUsuario("Contador Compartilhado", [
      { organizacaoId: cenario.organizacaoId, empresaId: cenario.empresaId, papel: "financeiro" },
      { organizacaoId: outraOrganizacao.organizacaoId, empresaId: outraOrganizacao.empresaId, papel: "financeiro" },
    ]);
  });

  afterAll(async () => {
    for (const organizacaoId of [cenario.organizacaoId, outraOrganizacao.organizacaoId]) {
      await banco.execute(sql`DELETE FROM eventos_auditoria WHERE organizacao_id = ${organizacaoId}`).catch(() => undefined);
      await banco.execute(sql`DELETE FROM convites WHERE organizacao_id = ${organizacaoId}`);
      await banco.execute(sql`DELETE FROM vinculos_usuario WHERE organizacao_id = ${organizacaoId}`);
    }
    await banco.execute(sql`DELETE FROM empresas WHERE id = ${empresaBId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    await apagarCenarioBase(banco as BancoTeste, outraOrganizacao);
    for (const usuarioId of usuarios) {
      await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuarioId}`).catch(() => undefined);
    }
    await cliente.end();
  });

  it("administrador de A NAO altera o papel de quem so tem vinculo em B; o vinculo fica como estava", async () => {
    await expect(repositorio.alterarPapel(escopoA, usuarioSoDeB, "administrador", adminDeA)).rejects.toBeInstanceOf(
      UsuarioNaoEncontradoNaEmpresa,
    );
    expect(await papelEm(usuarioSoDeB, empresaBId)).toEqual({ papel: "somente_leitura", ativo: true });
  });

  it("administrador de A NAO desativa quem so tem vinculo em B", async () => {
    await expect(repositorio.alterarSituacao(escopoA, usuarioSoDeB, false, adminDeA)).rejects.toBeInstanceOf(
      UsuarioNaoEncontradoNaEmpresa,
    );
    expect((await papelEm(usuarioSoDeB, empresaBId))?.ativo).toBe(true);
  });

  it("administrador de A NAO redefine o acesso de quem so tem vinculo em B", async () => {
    await expect(repositorio.redefinirAcesso(escopoA, usuarioSoDeB, adminDeA)).rejects.toBeInstanceOf(UsuarioNaoEncontradoNaEmpresa);
    const [convites] = await banco.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM convites c JOIN "user" u ON lower(u.email) = lower(c.email) WHERE u.id = ${usuarioSoDeB}
    `);
    expect(Number(convites!.n)).toBe(0);
  });

  it("desativar o UNICO administrador de B, logado como administrador de A, falha (e B continua com administrador)", async () => {
    await expect(repositorio.alterarSituacao(escopoA, adminDeB, false, adminDeA)).rejects.toBeInstanceOf(UsuarioNaoEncontradoNaEmpresa);
    expect((await papelEm(adminDeB, empresaBId))?.ativo).toBe(true);
  });

  it("a contagem de 'ultimo administrador' e por EMPRESA: o administrador de A nao conta para B", async () => {
    // Em B so ha um administrador. Um segundo administrador de B tenta rebaixa-lo: a trava e a de B, nao a da organizacao.
    const segundoAdminDeB = await criarUsuario("Admin B2", [{ organizacaoId: cenario.organizacaoId, empresaId: empresaBId, papel: "administrador" }]);
    // Com dois administradores em B, rebaixar um deles pode.
    await repositorio.alterarPapel(escopoB, segundoAdminDeB, "financeiro", adminDeB);
    // Agora so ha um: rebaixa-lo teria de falhar, mesmo com um administrador em A na mesma organizacao.
    await expect(repositorio.alterarPapel(escopoB, adminDeB, "financeiro", segundoAdminDeB)).rejects.toMatchObject({ codigo: "ultimo_administrador" });
  });

  it("dentro da propria empresa, alterar papel continua funcionando e so toca o vinculo daquela empresa", async () => {
    const emDuas = await criarUsuario("Em Duas Empresas", [
      { organizacaoId: cenario.organizacaoId, empresaId: cenario.empresaId, papel: "financeiro" },
      { organizacaoId: cenario.organizacaoId, empresaId: empresaBId, papel: "financeiro" },
    ]);
    await repositorio.alterarPapel(escopoA, emDuas, "tesouraria", adminDeA);

    expect((await papelEm(emDuas, cenario.empresaId))?.papel).toBe("tesouraria");
    // O vinculo com B nao muda: administrar A nao e administrar B.
    expect((await papelEm(emDuas, empresaBId))?.papel).toBe("financeiro");
  });

  it("redefinir acesso RECUSA quando a conta tambem serve a OUTRA organizacao", async () => {
    await expect(repositorio.redefinirAcesso(escopoA, usuarioDeAEDeOutraOrg, adminDeA)).rejects.toMatchObject({
      codigo: "redefinicao_nao_permitida",
    });
    await expect(repositorio.redefinirAcesso(escopoA, usuarioDeAEDeOutraOrg, adminDeA)).rejects.toBeInstanceOf(RedefinicaoNaoPermitida);
  });

  it("redefinir acesso de quem so esta nesta empresa devolve token E e-mail, e registra quem pediu", async () => {
    const alvo = await criarUsuario("Somente Aqui", [{ organizacaoId: cenario.organizacaoId, empresaId: cenario.empresaId, papel: "financeiro" }]);
    const { token, email } = await repositorio.redefinirAcesso(escopoA, alvo, adminDeA);

    expect(token.length).toBeGreaterThan(20);
    expect(email).toBe(contas.get([...contas.entries()].find(([, u]) => u.id === alvo)![0])!.email);

    const [evento] = await banco.execute<{ usuario_id: string; dados_depois: { autorUsuarioId?: string } }>(sql`
      SELECT usuario_id, dados_depois FROM eventos_auditoria
      WHERE acao = 'usuario.acesso_redefinido' AND entidade_id = ${alvo}
      ORDER BY ocorrido_em DESC LIMIT 1
    `);
    expect(evento?.usuario_id).toBe(adminDeA);
    expect(evento?.dados_depois.autorUsuarioId).toBe(adminDeA);
  });

  it("a lista de A nao traz quem so existe em B, e marca vinculos de organizacao inteira", async () => {
    const { usuarios: listados } = await repositorio.listar(escopoA, adminDeA);
    expect(listados.some((u) => u.usuarioId === usuarioSoDeB)).toBe(false);
    expect(listados.every((u) => u.vinculoDeOrganizacao === false)).toBe(true);
  });
});
