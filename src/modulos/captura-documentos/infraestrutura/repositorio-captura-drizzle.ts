import { and, eq, isNull } from "drizzle-orm";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { empresas } from "@/banco-dados/esquemas/indice";
import { ACOES_AUDITORIA, RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { EscopoResolvidoPorToken, RepositorioCaptura, TokenDeCapturaAtivo } from "../aplicacao/repositorio-captura";
import { tokensCaptura } from "./esquema";

/**
 * Tokens de captura contra PostgreSQL.
 *
 * Toda consulta filtra por `empresa_id` do escopo. A unica que nao recebe
 * escopo e `resolverEscopoPorToken`, que o PRODUZ — ver o contrato.
 */
export class RepositorioCapturaDrizzle implements RepositorioCaptura {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async obterTokenAtivo(escopo: EscopoEmpresa): Promise<TokenDeCapturaAtivo | null> {
    const [linha] = await this.banco
      .select({
        id: tokensCaptura.id,
        criadoEm: tokensCaptura.criadoEm,
        criadoPor: tokensCaptura.criadoPor,
        limiteEnviosHora: tokensCaptura.limiteEnviosHora,
      })
      .from(tokensCaptura)
      .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
      .limit(1);
    return linha ?? null;
  }

  async gerarToken(
    escopo: EscopoEmpresa,
    dados: { readonly tokenHash: string; readonly autorUsuarioId: string },
  ): Promise<{ readonly id: string; readonly substituiuAnterior: boolean }> {
    return executarEmTransacao(async (transacao) => {
      const agora = new Date();
      const revogados = await transacao
        .update(tokensCaptura)
        .set({ revogadoEm: agora, revogadoPor: dados.autorUsuarioId })
        .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
        .returning({ id: tokensCaptura.id });

      for (const revogado of revogados) {
        await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaRevogado, revogado.id, {
          motivo: "substituido",
        });
      }

      const [criado] = await transacao
        .insert(tokensCaptura)
        .values({ empresaId: escopo.empresaId, tokenHash: dados.tokenHash, criadoPor: dados.autorUsuarioId })
        .returning({ id: tokensCaptura.id });

      await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaGerado, criado!.id, {
        substituiuAnterior: revogados.length > 0,
      });

      return { id: criado!.id, substituiuAnterior: revogados.length > 0 };
    }, this.banco);
  }

  async revogarToken(escopo: EscopoEmpresa, dados: { readonly autorUsuarioId: string }): Promise<boolean> {
    return executarEmTransacao(async (transacao) => {
      const revogados = await transacao
        .update(tokensCaptura)
        .set({ revogadoEm: new Date(), revogadoPor: dados.autorUsuarioId })
        .where(and(eq(tokensCaptura.empresaId, escopo.empresaId), isNull(tokensCaptura.revogadoEm)))
        .returning({ id: tokensCaptura.id });

      for (const revogado of revogados) {
        await this.registrar(transacao, escopo, dados.autorUsuarioId, ACOES_AUDITORIA.qrCapturaRevogado, revogado.id, {
          motivo: "revogado",
        });
      }
      return revogados.length > 0;
    }, this.banco);
  }

  async resolverEscopoPorToken(tokenHash: string): Promise<EscopoResolvidoPorToken | null> {
    const [linha] = await this.banco
      .select({
        tokenId: tokensCaptura.id,
        limiteEnviosHora: tokensCaptura.limiteEnviosHora,
        empresaId: empresas.id,
        organizacaoId: empresas.organizacaoId,
        nomeEmpresa: empresas.nome,
        nomeFantasia: empresas.nomeFantasia,
      })
      .from(tokensCaptura)
      .innerJoin(empresas, eq(empresas.id, tokensCaptura.empresaId))
      .where(and(eq(tokensCaptura.tokenHash, tokenHash), isNull(tokensCaptura.revogadoEm)))
      .limit(1);
    if (!linha) return null;
    return {
      escopo: {
        organizacaoId: comoIdentificador<"Organizacao">(linha.organizacaoId),
        empresaId: comoIdentificador<"Empresa">(linha.empresaId),
      },
      tokenId: linha.tokenId,
      limiteEnviosHora: linha.limiteEnviosHora,
      nomeEmpresa: linha.nomeFantasia ?? linha.nomeEmpresa,
    };
  }

  /** O hash nunca vai para a trilha: so o id do token. */
  private async registrar(
    executor: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    usuarioId: string,
    acao: string,
    tokenId: string,
    dadosDepois: Record<string, unknown>,
  ): Promise<void> {
    await new RegistradorAuditoriaDrizzle(executor).registrar({
      acao,
      entidade: "token_captura",
      entidadeId: tokenId,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(usuarioId),
      origem: "interface",
      dadosDepois,
    });
  }
}
