import { and, eq, isNull, sql } from "drizzle-orm";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import type { Papel } from "@/nucleo/autorizacao/publico";
import type { Credenciais } from "@/nucleo/autenticacao/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type {
  ConvitePendente,
  ConviteParaAceite,
  RepositorioGestaoDeUsuarios,
  UsuarioDaEmpresa,
} from "../aplicacao/gestao-de-usuarios";
import {
  exigirConviteUtilizavel,
  expiracaoDoConvite,
  gerarTokenDeConvite,
  hashDoToken,
} from "../dominio/convite";
import {
  verificarAlteracaoDePapel,
  verificarDesativacao,
  type SituacaoDoAcesso,
} from "../dominio/regras-de-acesso";
import { convites, vinculosUsuario } from "./esquema";

interface LinhaUsuario extends Record<string, unknown> {
  usuario_id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  ultimo_acesso: string | null;
}

export class RepositorioGestaoDeUsuariosDrizzle implements RepositorioGestaoDeUsuarios {
  constructor(
    private readonly banco: ExecutorBancoDados,
    private readonly credenciais: Credenciais,
  ) {}

  async listar(escopo: EscopoEmpresa, usuarioAtualId: string) {
    const [linhas, pendentes] = await Promise.all([
      this.banco.execute<LinhaUsuario>(sql`
        SELECT u.id AS usuario_id, u.name AS nome, u.email, v.papel::text AS papel, v.ativo,
               -- Ultimo acesso pela sessao mais recentemente USADA, nao criada:
               -- a biblioteca atualiza updated_at a cada renovacao.
               (SELECT max(s.updated_at)::text FROM session s WHERE s.user_id = u.id) AS ultimo_acesso
        FROM vinculos_usuario v
        JOIN "user" u ON u.id = v.usuario_id
        WHERE v.organizacao_id = ${escopo.organizacaoId}
          AND (v.empresa_id = ${escopo.empresaId} OR v.empresa_id IS NULL)
        ORDER BY v.ativo DESC, u.name
      `),
      this.banco.execute<{ id: string; email: string; papel: string; expira_em: string; convidado_por_nome: string }>(sql`
        SELECT c.id::text AS id, c.email, c.papel::text AS papel, c.expira_em::text AS expira_em,
               COALESCE(a.name, '—') AS convidado_por_nome
        FROM convites c
        LEFT JOIN "user" a ON a.id = c.convidado_por
        WHERE c.organizacao_id = ${escopo.organizacaoId}
          AND (c.empresa_id = ${escopo.empresaId} OR c.empresa_id IS NULL)
          AND c.aceito_em IS NULL AND c.cancelado_em IS NULL
        ORDER BY c.criado_em DESC
      `),
    ]);

    const agora = Date.now();
    const usuarios: UsuarioDaEmpresa[] = linhas.map((linha) => ({
      usuarioId: linha.usuario_id,
      nome: linha.nome,
      email: linha.email,
      papel: linha.papel as Papel,
      ativo: linha.ativo,
      ultimoAcesso: linha.ultimo_acesso ? new Date(linha.ultimo_acesso) : null,
      ehVoce: linha.usuario_id === usuarioAtualId,
    }));

    const convitesPendentes: ConvitePendente[] = pendentes.map((linha) => ({
      id: linha.id,
      email: linha.email,
      papel: linha.papel as Papel,
      expiraEm: new Date(linha.expira_em),
      expirado: new Date(linha.expira_em).getTime() <= agora,
      convidadoPorNome: linha.convidado_por_nome,
    }));

    return { usuarios, convites: convitesPendentes };
  }

  async convidar(escopo: EscopoEmpresa, dados: { email: string; papel: Papel; autorUsuarioId: string }) {
    const email = dados.email.trim().toLowerCase();
    const token = gerarTokenDeConvite();

    return executarEmTransacao(async (transacao) => {
      /*
       * Um convite pendente por e-mail. Dois links validos ao mesmo tempo
       * significam que o primeiro, ja enviado, continua servindo depois de a
       * pessoa receber o segundo — e "cancelei e mandei outro" deixaria de ser
       * verdade.
       */
      await transacao
        .update(convites)
        .set({ canceladoEm: new Date() })
        .where(
          and(
            eq(convites.organizacaoId, escopo.organizacaoId),
            sql`lower(${convites.email}) = ${email}`,
            isNull(convites.aceitoEm),
            isNull(convites.canceladoEm),
          ),
        );

      const agora = new Date();
      const [criado] = await transacao
        .insert(convites)
        .values({
          organizacaoId: escopo.organizacaoId,
          empresaId: escopo.empresaId,
          email,
          papel: dados.papel,
          tokenHash: hashDoToken(token),
          convidadoPor: dados.autorUsuarioId,
          expiraEm: expiracaoDoConvite(agora),
        })
        .returning({ id: convites.id });

      await this.registrar(transacao, escopo, dados.autorUsuarioId, "convite.criado", criado!.id, {
        email,
        papel: dados.papel,
        expiraEm: expiracaoDoConvite(agora).toISOString(),
      });

      return { conviteId: criado!.id, token };
    }, this.banco);
  }

  async cancelarConvite(escopo: EscopoEmpresa, conviteId: string, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      await transacao
        .update(convites)
        .set({ canceladoEm: new Date() })
        .where(
          and(eq(convites.id, conviteId), eq(convites.organizacaoId, escopo.organizacaoId), isNull(convites.aceitoEm)),
        );
      await this.registrar(transacao, escopo, autorUsuarioId, "convite.cancelado", conviteId, null);
    }, this.banco);
  }

  async alterarPapel(escopo: EscopoEmpresa, alvoUsuarioId: string, papel: Papel, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const situacao = await this.situacaoDoAcesso(transacao, escopo, alvoUsuarioId, autorUsuarioId);
      verificarAlteracaoDePapel(situacao, papel === "administrador");

      const antes = await this.vinculo(transacao, escopo, alvoUsuarioId);
      await transacao
        .update(vinculosUsuario)
        .set({ papel, atualizadoEm: new Date() })
        .where(and(eq(vinculosUsuario.usuarioId, alvoUsuarioId), eq(vinculosUsuario.organizacaoId, escopo.organizacaoId)));

      await this.registrar(transacao, escopo, autorUsuarioId, "usuario.papel_alterado", alvoUsuarioId, { papel }, { papel: antes?.papel });
    }, this.banco);
  }

  async alterarSituacao(escopo: EscopoEmpresa, alvoUsuarioId: string, ativo: boolean, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      if (!ativo) {
        const situacao = await this.situacaoDoAcesso(transacao, escopo, alvoUsuarioId, autorUsuarioId);
        verificarDesativacao(situacao);
      }

      await transacao
        .update(vinculosUsuario)
        .set({ ativo, atualizadoEm: new Date() })
        .where(and(eq(vinculosUsuario.usuarioId, alvoUsuarioId), eq(vinculosUsuario.organizacaoId, escopo.organizacaoId)));

      await this.registrar(transacao, escopo, autorUsuarioId, ativo ? "usuario.reativado" : "usuario.desativado", alvoUsuarioId, { ativo });
    }, this.banco);

    /*
     * Encerrar as sessoes FORA da transacao, e depois dela.
     *
     * A sessao vive no armazenamento da biblioteca de autenticacao; apagar por
     * dentro da transacao e desfazer a transacao depois deixaria a pessoa
     * deslogada com o acesso intacto. Na ordem atual, o pior caso e ela
     * continuar navegando alguns instantes com o vinculo ja desativado — e a
     * guarda de acesso, que le o vinculo a cada requisicao, ja a barra.
     */
    if (!ativo) await this.credenciais.encerrarSessoes(alvoUsuarioId);
  }

  async redefinirAcesso(escopo: EscopoEmpresa, alvoUsuarioId: string, autorUsuarioId: string) {
    const [alvo] = await this.banco.execute<{ email: string; papel: string }>(sql`
      SELECT u.email, v.papel::text AS papel
      FROM vinculos_usuario v JOIN "user" u ON u.id = v.usuario_id
      WHERE v.usuario_id = ${alvoUsuarioId} AND v.organizacao_id = ${escopo.organizacaoId}
      LIMIT 1
    `);
    if (!alvo) throw new Error("Usuário não encontrado nesta organização.");

    const { token } = await this.convidar(escopo, {
      email: alvo.email,
      papel: alvo.papel as Papel,
      autorUsuarioId,
    });
    return { token };
  }

  async lerConvitePeloToken(token: string): Promise<ConviteParaAceite | null> {
    const [linha] = await this.banco.execute<{
      email: string;
      papel: string;
      expira_em: string;
      aceito_em: string | null;
      cancelado_em: string | null;
      nome_empresa: string | null;
    }>(sql`
      SELECT c.email, c.papel::text AS papel, c.expira_em::text AS expira_em,
             c.aceito_em::text AS aceito_em, c.cancelado_em::text AS cancelado_em,
             COALESCE(e.nome_fantasia, e.nome) AS nome_empresa
      FROM convites c
      LEFT JOIN empresas e ON e.id = c.empresa_id
      WHERE c.token_hash = ${hashDoToken(token)}
      LIMIT 1
    `);

    if (!linha) return null;
    exigirConviteUtilizavel(
      {
        expiraEm: new Date(linha.expira_em),
        aceitoEm: linha.aceito_em ? new Date(linha.aceito_em) : null,
        canceladoEm: linha.cancelado_em ? new Date(linha.cancelado_em) : null,
      },
      new Date(),
    );

    const jaExiste = await this.credenciais.buscarPorEmail(linha.email);
    return {
      email: linha.email,
      papel: linha.papel as Papel,
      nomeDaEmpresa: linha.nome_empresa ?? "—",
      jaTemConta: jaExiste !== null,
    };
  }

  async aceitarConvite(token: string, dados: { nome: string; senha: string }): Promise<{ usuarioId: string }> {
    const tokenHash = hashDoToken(token);

    const [convite] = await this.banco.execute<{
      id: string;
      organizacao_id: string;
      empresa_id: string | null;
      email: string;
      papel: string;
      expira_em: string;
      aceito_em: string | null;
      cancelado_em: string | null;
    }>(sql`
      SELECT id::text AS id, organizacao_id::text AS organizacao_id, empresa_id::text AS empresa_id,
             email, papel::text AS papel, expira_em::text AS expira_em,
             aceito_em::text AS aceito_em, cancelado_em::text AS cancelado_em
      FROM convites WHERE token_hash = ${tokenHash} LIMIT 1
    `);

    exigirConviteUtilizavel(
      convite
        ? {
            expiraEm: new Date(convite.expira_em),
            aceitoEm: convite.aceito_em ? new Date(convite.aceito_em) : null,
            canceladoEm: convite.cancelado_em ? new Date(convite.cancelado_em) : null,
          }
        : null,
      new Date(),
    );

    /*
     * A conta vive no armazenamento da biblioteca de autenticacao, fora desta
     * transacao. Por isso ela e criada ANTES: se o vinculo falhar, sobra uma
     * conta sem acesso, que um novo convite resolve. Na ordem inversa,
     * sobraria um convite consumido sem conta — e a pessoa ficaria sem
     * caminho nenhum.
     */
    const existente = await this.credenciais.buscarPorEmail(convite!.email);
    const usuario = existente
      ? (await this.credenciais.definirSenha(existente.id, dados.senha), existente)
      : await this.credenciais.criarUsuarioComSenha({ nome: dados.nome, email: convite!.email, senha: dados.senha });

    await executarEmTransacao(async (transacao) => {
      /*
       * Marcar o convite como usado CONDICIONADO a ele ainda estar em aberto.
       * Dois cliques simultaneos no mesmo link chegam aqui juntos; so um
       * encontra `aceito_em IS NULL` e grava. O outro nao altera linha nenhuma.
       */
      const marcado = await transacao.execute(sql`
        UPDATE convites SET aceito_em = now(), aceito_por = ${usuario.id}
        WHERE id = ${convite!.id}::uuid AND aceito_em IS NULL AND cancelado_em IS NULL
        RETURNING id
      `);
      if (marcado.length === 0) return;

      await transacao.execute(sql`
        INSERT INTO vinculos_usuario (usuario_id, organizacao_id, empresa_id, papel, ativo)
        VALUES (${usuario.id}, ${convite!.organizacao_id}::uuid,
                ${convite!.empresa_id}::uuid, ${convite!.papel}::papel_vinculo, true)
        ON CONFLICT (usuario_id, organizacao_id, empresa_id)
        DO UPDATE SET papel = EXCLUDED.papel, ativo = true, atualizado_em = now()
      `);

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "convite.aceito",
        entidade: "convite",
        entidadeId: convite!.id,
        organizacaoId: comoIdentificador<"Organizacao">(convite!.organizacao_id),
        ...(convite!.empresa_id ? { empresaId: comoIdentificador<"Empresa">(convite!.empresa_id) } : {}),
        usuarioId: comoIdentificador<"Usuario">(usuario.id),
        origem: "interface",
        dadosDepois: { email: convite!.email, papel: convite!.papel, contaJaExistia: existente !== null },
      });
    }, this.banco);

    return { usuarioId: usuario.id };
  }

  // ------------------------------------------------------------------ apoio

  private async vinculo(executor: ExecutorBancoDados, escopo: EscopoEmpresa, usuarioId: string) {
    const [linha] = await executor
      .select({ papel: vinculosUsuario.papel, ativo: vinculosUsuario.ativo })
      .from(vinculosUsuario)
      .where(and(eq(vinculosUsuario.usuarioId, usuarioId), eq(vinculosUsuario.organizacaoId, escopo.organizacaoId)))
      .limit(1);
    return linha ?? null;
  }

  private async situacaoDoAcesso(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    alvoUsuarioId: string,
    autorUsuarioId: string,
  ): Promise<SituacaoDoAcesso> {
    const alvo = await this.vinculo(executor, escopo, alvoUsuarioId);
    const [contagem] = await executor.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM vinculos_usuario
      WHERE organizacao_id = ${escopo.organizacaoId} AND papel = 'administrador' AND ativo = true
    `);

    return {
      alvoUsuarioId,
      alvoEhAdministradorAtivo: alvo?.papel === "administrador" && alvo.ativo,
      autorUsuarioId,
      administradoresAtivos: Number(contagem?.n ?? "0"),
    };
  }

  private async registrar(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    usuarioId: string,
    acao: string,
    entidadeId: string,
    dadosDepois: Record<string, unknown> | null,
    dadosAntes?: Record<string, unknown>,
  ) {
    await new RegistradorAuditoriaDrizzle(executor).registrar({
      acao,
      entidade: acao.startsWith("convite") ? "convite" : "usuario",
      entidadeId,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(usuarioId),
      origem: "interface",
      ...(dadosAntes ? { dadosAntes } : {}),
      ...(dadosDepois ? { dadosDepois } : {}),
    });
  }
}
