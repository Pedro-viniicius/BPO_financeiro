import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import {
  apagarCenarioBase, criarBancoTeste, criarCenarioBase, urlBancoTeste,
  type BancoTeste, type CenarioBase,
} from "@/banco-dados/testes/apoio-testes-banco";
import type { Credenciais, UsuarioDeAutenticacao } from "@/nucleo/autenticacao/publico";

import { ConviteInvalido, hashDoToken } from "../dominio/convite";
import { NaoPodeAlterarOProprioAcesso, UltimoAdministrador } from "../dominio/regras-de-acesso";
import { RepositorioGestaoDeUsuariosDrizzle } from "./repositorio-gestao-usuarios-drizzle";

/**
 * Gestao de usuarios contra PostgreSQL real, incluindo o ISOLAMENTO entre
 * organizacoes: o convite de uma nunca aparece na lista da outra.
 *
 * As credenciais sao dubles porque a conta vive no armazenamento da biblioteca
 * de autenticacao, nao neste banco. O que se prova aqui e o que e nosso: o
 * convite de uso unico, o vinculo, as travas e o encerramento de sessao.
 */
describe.skipIf(!urlBancoTeste)("gestao de usuarios (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste();

  const contas = new Map<string, UsuarioDeAutenticacao>();
  const senhas = new Map<string, string>();
  const sessoesEncerradas: string[] = [];

  const credenciais: Credenciais = {
    async buscarPorEmail(email) {
      return contas.get(email.toLowerCase()) ?? null;
    },
    async criarUsuarioComSenha({ nome, email, senha }) {
      const id = `usuario-${contas.size + 1}-${Date.now()}`;
      await banco.execute(sql`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${id}, ${nome}, ${email.toLowerCase()}, true, now(), now())
      `);
      const usuario = { id, nome, email: email.toLowerCase() };
      contas.set(usuario.email, usuario);
      senhas.set(id, senha);
      return usuario;
    },
    async definirSenha(usuarioId, senha) {
      senhas.set(usuarioId, senha);
      sessoesEncerradas.push(usuarioId);
    },
    async encerrarSessoes(usuarioId) {
      sessoesEncerradas.push(usuarioId);
    },
  };

  const repositorio = new RepositorioGestaoDeUsuariosDrizzle(banco as never, credenciais);
  let cenario: CenarioBase;
  let escopo: EscopoEmpresa;
  let admin = "";
  let outroAdmin = "";

  const criarUsuario = async (nome: string, email: string, papel: string) => {
    const [linha] = await banco.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`);
    const id = linha!.id;
    await banco.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${id}, ${nome}, ${email}, true, now(), now())
    `);
    await banco.execute(sql`
      INSERT INTO vinculos_usuario (usuario_id, organizacao_id, empresa_id, papel, ativo)
      VALUES (${id}, ${cenario.organizacaoId}, ${cenario.empresaId}, ${papel}::papel_vinculo, true)
    `);
    contas.set(email, { id, nome, email });
    return id;
  };

  beforeAll(async () => {
    cenario = await criarCenarioBase(banco as BancoTeste);
    escopo = {
      organizacaoId: comoIdentificador<"Organizacao">(cenario.organizacaoId),
      empresaId: comoIdentificador<"Empresa">(cenario.empresaId),
    };
    admin = await criarUsuario("Administradora", `admin-${Date.now()}@exemplo.local`, "administrador");
    outroAdmin = await criarUsuario("Segundo Admin", `admin2-${Date.now()}@exemplo.local`, "administrador");
  });

  afterAll(async () => {
    await banco.execute(sql`DELETE FROM eventos_auditoria WHERE empresa_id = ${cenario.empresaId}`).catch(() => undefined);
    await banco.execute(sql`DELETE FROM convites WHERE organizacao_id = ${cenario.organizacaoId}`);
    await banco.execute(sql`DELETE FROM vinculos_usuario WHERE organizacao_id = ${cenario.organizacaoId}`);
    await apagarCenarioBase(banco as BancoTeste, cenario);
    for (const usuario of contas.values()) {
      await banco.execute(sql`DELETE FROM "user" WHERE id = ${usuario.id}`).catch(() => undefined);
    }
    await cliente.end();
  });

  it("o convite guarda o HASH do token, nunca o token", async () => {
    const { token, conviteId } = await repositorio.convidar(escopo, {
      email: "novo@exemplo.local",
      papel: "financeiro",
      autorUsuarioId: admin,
    });

    const [linha] = await banco.execute<{ token_hash: string }>(sql`
      SELECT token_hash FROM convites WHERE id = ${conviteId}::uuid
    `);
    expect(linha!.token_hash).toBe(hashDoToken(token));
    expect(linha!.token_hash).not.toBe(token);
  });

  it("convidar o mesmo e-mail de novo CANCELA o link anterior", async () => {
    const primeiro = await repositorio.convidar(escopo, { email: "repetido@exemplo.local", papel: "financeiro", autorUsuarioId: admin });
    const segundo = await repositorio.convidar(escopo, { email: "repetido@exemplo.local", papel: "tesouraria", autorUsuarioId: admin });

    // O primeiro link deixou de servir: "cancelei e mandei outro" e verdade.
    await expect(repositorio.lerConvitePeloToken(primeiro.token)).rejects.toBeInstanceOf(ConviteInvalido);
    await expect(repositorio.lerConvitePeloToken(segundo.token)).resolves.toBeTruthy();
  });

  it("USO UNICO: o convite aceito nao serve de novo", async () => {
    const { token } = await repositorio.convidar(escopo, { email: "unico@exemplo.local", papel: "financeiro", autorUsuarioId: admin });

    const { usuarioId } = await repositorio.aceitarConvite(token, { nome: "Pessoa Nova", senha: "SenhaForte#2026" });
    expect(usuarioId).toBeTruthy();

    await expect(repositorio.aceitarConvite(token, { nome: "Outra", senha: "OutraSenha#2026" })).rejects.toThrow(/já foi usado/);
  });

  it("aceitar o convite cria o vinculo com o papel do convite", async () => {
    const { token } = await repositorio.convidar(escopo, { email: "compapel@exemplo.local", papel: "tesouraria", autorUsuarioId: admin });
    const { usuarioId } = await repositorio.aceitarConvite(token, { nome: "Tesoureiro", senha: "SenhaForte#2026" });

    const [vinculo] = await banco.execute<{ papel: string; ativo: boolean }>(sql`
      SELECT papel::text AS papel, ativo FROM vinculos_usuario
      WHERE usuario_id = ${usuarioId} AND organizacao_id = ${cenario.organizacaoId}
    `);
    expect(vinculo!.papel).toBe("tesouraria");
    expect(vinculo!.ativo).toBe(true);
  });

  it("o convite EXPIRADO nao serve", async () => {
    const { token, conviteId } = await repositorio.convidar(escopo, { email: "expirado@exemplo.local", papel: "financeiro", autorUsuarioId: admin });
    // Envelhece o convite INTEIRO: o CHECK `expira_em > criado_em` impede
    // antecipar so o vencimento — e a restricao esta certa, um convite que
    // nasce vencido nunca deveria existir.
    await banco.execute(sql`
      UPDATE convites
      SET criado_em = now() - interval '72 hours', expira_em = now() - interval '24 hours'
      WHERE id = ${conviteId}::uuid
    `);

    await expect(repositorio.lerConvitePeloToken(token)).rejects.toThrow(/expirou/);
  });

  it("o convite CANCELADO nao serve", async () => {
    const { token, conviteId } = await repositorio.convidar(escopo, { email: "cancelado@exemplo.local", papel: "financeiro", autorUsuarioId: admin });
    await repositorio.cancelarConvite(escopo, conviteId, admin);

    await expect(repositorio.lerConvitePeloToken(token)).rejects.toThrow(/cancelado/);
  });

  it("redefinir acesso gera link para quem JA tem conta, e encerra as sessoes ao ser usado", async () => {
    const email = `redefinir-${Date.now()}@exemplo.local`;
    const alvo = await criarUsuario("Pessoa Existente", email, "financeiro");

    const { token } = await repositorio.redefinirAcesso(escopo, alvo, admin);
    const convite = await repositorio.lerConvitePeloToken(token);
    expect(convite?.jaTemConta).toBe(true);

    sessoesEncerradas.length = 0;
    await repositorio.aceitarConvite(token, { nome: "Pessoa Existente", senha: "NovaSenha#2026" });

    expect(senhas.get(alvo)).toBe("NovaSenha#2026");
    expect(sessoesEncerradas).toContain(alvo);
  });

  it("TRAVA: nao desativa o ultimo administrador ativo", async () => {
    // Deixa apenas um administrador ativo.
    await repositorio.alterarSituacao(escopo, outroAdmin, false, admin);

    const sozinho = await criarUsuario("Operador", `op-${Date.now()}@exemplo.local`, "financeiro");
    await expect(repositorio.alterarSituacao(escopo, admin, false, sozinho)).rejects.toBeInstanceOf(UltimoAdministrador);
    await expect(repositorio.alterarPapel(escopo, admin, "financeiro", sozinho)).rejects.toBeInstanceOf(UltimoAdministrador);

    await repositorio.alterarSituacao(escopo, outroAdmin, true, admin);
  });

  it("TRAVA: ninguem desativa a si mesmo nem retira a propria administracao", async () => {
    await expect(repositorio.alterarSituacao(escopo, admin, false, admin)).rejects.toBeInstanceOf(NaoPodeAlterarOProprioAcesso);
    await expect(repositorio.alterarPapel(escopo, admin, "financeiro", admin)).rejects.toBeInstanceOf(NaoPodeAlterarOProprioAcesso);
  });

  it("desativar ENCERRA as sessoes da pessoa", async () => {
    const alvo = await criarUsuario("Para Desativar", `desativar-${Date.now()}@exemplo.local`, "financeiro");
    sessoesEncerradas.length = 0;

    await repositorio.alterarSituacao(escopo, alvo, false, admin);

    expect(sessoesEncerradas).toContain(alvo);
    const [vinculo] = await banco.execute<{ ativo: boolean }>(sql`
      SELECT ativo FROM vinculos_usuario WHERE usuario_id = ${alvo}
    `);
    expect(vinculo!.ativo).toBe(false);
    // E a pessoa continua existindo: o historico aponta para ela.
    const [usuario] = await banco.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM "user" WHERE id = ${alvo}`);
    expect(Number(usuario!.n)).toBe(1);
  });

  it("a lista traz papel, situacao e ultimo acesso", async () => {
    const { usuarios } = await repositorio.listar(escopo, admin);
    const eu = usuarios.find((u) => u.usuarioId === admin);

    expect(eu?.ehVoce).toBe(true);
    expect(eu?.papel).toBe("administrador");
    expect(usuarios.some((u) => !u.ativo)).toBe(true);
  });

  it("uma organizacao nao enxerga os convites da outra", async () => {
    const outra = await criarCenarioBase(banco as BancoTeste);
    try {
      const escopoOutra: EscopoEmpresa = {
        organizacaoId: comoIdentificador<"Organizacao">(outra.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(outra.empresaId),
      };
      const { convites } = await repositorio.listar(escopoOutra, admin);
      expect(convites).toEqual([]);

      const { usuarios } = await repositorio.listar(escopoOutra, admin);
      expect(usuarios.every((u) => u.usuarioId !== admin)).toBe(true);
    } finally {
      await banco.execute(sql`DELETE FROM convites WHERE organizacao_id = ${outra.organizacaoId}`);
      await banco.execute(sql`DELETE FROM vinculos_usuario WHERE organizacao_id = ${outra.organizacaoId}`);
      await apagarCenarioBase(banco as BancoTeste, outra);
    }
  });
});
