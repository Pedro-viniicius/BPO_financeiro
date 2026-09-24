import { and, eq, isNull, or, sql } from "drizzle-orm";

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
  RedefinicaoNaoPermitida,
  type SituacaoDoAcesso,
  UsuarioNaoEncontradoNaEmpresa,
  verificarAlteracaoDePapel,
  verificarDesativacao,
} from "../dominio/regras-de-acesso";
import { convites, vinculosUsuario } from "./esquema";

interface LinhaUsuario extends Record<string, unknown> {
  usuario_id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  ultimo_acesso: string | null;
  vinculo_de_organizacao: boolean;
}

/**
 * Gestao de usuarios contra PostgreSQL.
 *
 * ESCOPO POR EMPRESA em toda escrita. Um vinculo e por empresa
 * (`unico_vinculos_usuario_escopo`), e quem administra a empresa A so mexe
 * no vinculo que a pessoa tem COM A: alterar papel, desativar e redefinir
 * acesso filtram por `empresa_id = escopo.empresaId`, nunca so pela
 * organizacao. Um vinculo em B, empresa irma, fica intocado — e a resposta
 * para quem tenta e "nao encontrado nesta empresa", sem confirmar que existe
 * em B.
 *
 * Vinculos "toda a organizacao" (`empresa_id` nulo) aparecem na lista, porque
 * dao acesso a esta empresa, mas nao sao alterados por esta tela: eles nao
 * pertencem a empresa alguma. Hoje a interface nao cria vinculos assim (o
 * convite e sempre por empresa); se um dia criar, a gestao deles pede tela
 * propria, no nivel da organizacao. Decisao registrada aqui para nao ser
 * tomada em silencio.
 */
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
               (SELECT max(s.updated_at)::text FROM session s WHERE s.user_id = u.id) AS ultimo_acesso,
               (v.empresa_id IS NULL) AS vinculo_de_organizacao
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
      vinculoDeOrganizacao: linha.vinculo_de_organizacao,
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
    return executarEmTransacao((transacao) => this.criarConvite(transacao, escopo, dados), this.banco);
  }

  async cancelarConvite(escopo: EscopoEmpresa, conviteId: string, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      await transacao
        .update(convites)
        .set({ canceladoEm: new Date() })
        .where(
          and(
            eq(convites.id, conviteId),
            eq(convites.organizacaoId, escopo.organizacaoId),
            // So os convites que esta tela lista: os desta empresa e os da organizacao inteira.
            or(eq(convites.empresaId, escopo.empresaId), isNull(convites.empresaId)),
            isNull(convites.aceitoEm),
          ),
        );
      await this.registrar(transacao, escopo, autorUsuarioId, "convite.cancelado", conviteId, null);
    }, this.banco);
  }

  async alterarPapel(escopo: EscopoEmpresa, alvoUsuarioId: string, papel: Papel, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.vinculo(transacao, escopo, alvoUsuarioId);
      if (!antes) throw new UsuarioNaoEncontradoNaEmpresa();

      const situacao = await this.situacaoDoAcesso(transacao, escopo, alvoUsuarioId, autorUsuarioId);
      verificarAlteracaoDePapel(situacao, papel === "administrador");

      await transacao
        .update(vinculosUsuario)
        .set({ papel, atualizadoEm: new Date() })
        .where(this.condicaoDoVinculo(escopo, alvoUsuarioId));

      await this.registrar(transacao, escopo, autorUsuarioId, "usuario.papel_alterado", alvoUsuarioId, { papel }, { papel: antes.papel });
    }, this.banco);
  }

  async alterarSituacao(escopo: EscopoEmpresa, alvoUsuarioId: string, ativo: boolean, autorUsuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await this.vinculo(transacao, escopo, alvoUsuarioId);
      if (!antes) throw new UsuarioNaoEncontradoNaEmpresa();

      if (!ativo) {
        const situacao = await this.situacaoDoAcesso(transacao, escopo, alvoUsuarioId, autorUsuarioId);
        verificarDesativacao(situacao);
      }

      await transacao
        .update(vinculosUsuario)
        .set({ ativo, atualizadoEm: new Date() })
        .where(this.condicaoDoVinculo(escopo, alvoUsuarioId));

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
    return executarEmTransacao(async (transacao) => {
      const [alvo] = await transacao.execute<{ email: string; papel: string; outras: string }>(sql`
        SELECT u.email, v.papel::text AS papel,
               -- Vinculos ATIVOS do alvo em OUTRAS organizacoes: a conta serve a mais gente do que esta empresa.
               (SELECT count(*)::text FROM vinculos_usuario o
                 WHERE o.usuario_id = u.id AND o.ativo = true AND o.organizacao_id <> ${escopo.organizacaoId}) AS outras
        FROM vinculos_usuario v JOIN "user" u ON u.id = v.usuario_id
        WHERE v.usuario_id = ${alvoUsuarioId}
          AND v.organizacao_id = ${escopo.organizacaoId}
          AND v.empresa_id = ${escopo.empresaId}
        LIMIT 1
      `);
      if (!alvo) throw new UsuarioNaoEncontradoNaEmpresa();
      if (Number(alvo.outras) > 0) throw new RedefinicaoNaoPermitida("conta_compartilhada");

      const { token } = await this.criarConvite(transacao, escopo, {
        email: alvo.email,
        papel: alvo.papel as Papel,
        autorUsuarioId,
      });

      // Quem pediu a redefinicao fica na trilha, junto do alvo: e um ato sobre a conta de outra pessoa.
      await this.registrar(transacao, escopo, autorUsuarioId, "usuario.acesso_redefinido", alvoUsuarioId, {
        email: alvo.email,
        autorUsuarioId,
      });

      return { token, email: alvo.email };
    }, this.banco);
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

  /**
   * O vinculo que ESTA empresa pode administrar: o da pessoa com a propria
   * empresa. Nem o de uma empresa irma, nem o de "toda a organizacao".
   */
  private condicaoDoVinculo(escopo: EscopoEmpresa, usuarioId: string) {
    return and(
      eq(vinculosUsuario.usuarioId, usuarioId),
      eq(vinculosUsuario.organizacaoId, escopo.organizacaoId),
      eq(vinculosUsuario.empresaId, escopo.empresaId),
    );
  }

  private async criarConvite(
    transacao: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    dados: { email: string; papel: Papel; autorUsuarioId: string },
  ): Promise<{ conviteId: string; token: string }> {
    const email = dados.email.trim().toLowerCase();
    const token = gerarTokenDeConvite();

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
  }

  private async vinculo(executor: ExecutorBancoDados, escopo: EscopoEmpresa, usuarioId: string) {
    const [linha] = await executor
      .select({ papel: vinculosUsuario.papel, ativo: vinculosUsuario.ativo })
      .from(vinculosUsuario)
      .where(this.condicaoDoVinculo(escopo, usuarioId))
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
    // Administradores que alcancam ESTA empresa: os dela e os de "toda a organizacao".
    const [contagem] = await executor.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM vinculos_usuario
      WHERE organizacao_id = ${escopo.organizacaoId} AND papel = 'administrador' AND ativo = true
        AND (empresa_id = ${escopo.empresaId} OR empresa_id IS NULL)
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
