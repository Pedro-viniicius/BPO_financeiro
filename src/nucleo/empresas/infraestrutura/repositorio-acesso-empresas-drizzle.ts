import { and, eq, isNull, or, sql } from "drizzle-orm";

import { comoIdentificador, type IdEmpresa, type IdOrganizacao, type IdUsuario } from "@/compartilhado/tipos/identificadores";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { ehPapelConhecido, type Papel } from "@/nucleo/autorizacao/publico";
import { type BancoDados, type ExecutorBancoDados, executarEmTransacao } from "@/nucleo/banco-dados/publico";

import type {
  EscritaInstalacaoEmpresa,
  LeitorAcessoEmpresas,
  UnidadeInstalacaoEmpresa,
} from "../aplicacao/repositorio-acesso-empresas";
import type { EmpresaAcessivel } from "../dominio/acesso-empresas";
import { empresas, organizacoes, vinculosUsuario } from "./esquema";

/**
 * Acesso a empresas no PostgreSQL.
 *
 * `listarEmpresasAcessiveis` e a consulta que sustenta o isolamento entre
 * empresas: tudo o que a casca e o contexto sabem sobre "quais empresas"
 * sai daqui, filtrado por `usuario_id` da sessao.
 */
export class RepositorioAcessoEmpresasDrizzle implements LeitorAcessoEmpresas, UnidadeInstalacaoEmpresa {
  constructor(private readonly banco: BancoDados) {}

  async listarEmpresasAcessiveis(usuarioId: IdUsuario): Promise<readonly EmpresaAcessivel[]> {
    const linhas = await this.banco
      .select({
        empresaId: empresas.id,
        organizacaoId: empresas.organizacaoId,
        nome: empresas.nome,
        nomeFantasia: empresas.nomeFantasia,
        fusoHorario: empresas.fusoHorario,
        papel: vinculosUsuario.papel,
        permissoesExtras: vinculosUsuario.permissoesExtras,
        permissoesRemovidas: vinculosUsuario.permissoesRemovidas,
        vinculoEmpresaId: vinculosUsuario.empresaId,
      })
      .from(vinculosUsuario)
      .innerJoin(organizacoes, eq(organizacoes.id, vinculosUsuario.organizacaoId))
      .innerJoin(
        empresas,
        and(
          eq(empresas.organizacaoId, vinculosUsuario.organizacaoId),
          or(isNull(vinculosUsuario.empresaId), eq(empresas.id, vinculosUsuario.empresaId)),
        ),
      )
      .where(
        and(
          eq(vinculosUsuario.usuarioId, usuarioId),
          eq(vinculosUsuario.ativo, true),
          eq(organizacoes.ativa, true),
          eq(empresas.ativa, true),
          isNull(empresas.excluidoEm),
        ),
      );

    const resultado = new Map<string, EmpresaAcessivel>();
    for (const linha of linhas) {
      const pelaOrganizacao = linha.vinculoEmpresaId === null;
      // Vinculo direto com a empresa prevalece sobre o vinculo de organizacao.
      if (resultado.has(linha.empresaId) && pelaOrganizacao) continue;
      if (!ehPapelConhecido(linha.papel)) continue;
      resultado.set(linha.empresaId, {
        empresaId: comoIdentificador<"Empresa">(linha.empresaId),
        organizacaoId: comoIdentificador<"Organizacao">(linha.organizacaoId),
        nome: linha.nome,
        ...(linha.nomeFantasia ? { nomeFantasia: linha.nomeFantasia } : {}),
        fusoHorario: linha.fusoHorario,
        papel: linha.papel,
        permissoesExtras: linha.permissoesExtras,
        permissoesRemovidas: linha.permissoesRemovidas,
        acessoPelaOrganizacao: pelaOrganizacao,
      });
    }
    return [...resultado.values()];
  }

  executarAtomicamente<T>(operacao: (escrita: EscritaInstalacaoEmpresa) => Promise<T>): Promise<T> {
    return executarEmTransacao((transacao) => operacao(new EscritaInstalacaoEmpresaDrizzle(transacao)), this.banco);
  }
}

/** Escrita da instalacao, sempre sobre a transacao aberta pelo repositorio. */
class EscritaInstalacaoEmpresaDrizzle implements EscritaInstalacaoEmpresa {
  private readonly auditoria: RegistradorAuditoriaDrizzle;

  constructor(private readonly transacao: ExecutorBancoDados) {
    this.auditoria = new RegistradorAuditoriaDrizzle(transacao);
  }

  /**
   * Lock consultivo (advisory) de transacao, chaveado pelo usuario. E
   * liberado automaticamente no commit/rollback. Duas instalacoes do mesmo
   * usuario ficam em fila; a segunda ve o vinculo da primeira e desiste.
   */
  async travarUsuarioParaInstalacao(usuarioId: IdUsuario): Promise<void> {
    await this.transacao.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instalacao:" + usuarioId}))`);
  }

  async contarVinculosAtivos(usuarioId: IdUsuario): Promise<number> {
    const [linha] = await this.transacao
      .select({ total: sql<number>`count(*)::int` })
      .from(vinculosUsuario)
      .where(and(eq(vinculosUsuario.usuarioId, usuarioId), eq(vinculosUsuario.ativo, true)));
    return linha?.total ?? 0;
  }

  async cnpjJaExiste(cnpj: string): Promise<boolean> {
    const [linha] = await this.transacao.select({ id: empresas.id }).from(empresas).where(eq(empresas.cnpj, cnpj)).limit(1);
    return linha !== undefined;
  }

  async criarOrganizacao(dados: { nome: string }): Promise<IdOrganizacao> {
    const [linha] = await this.transacao.insert(organizacoes).values({ nome: dados.nome }).returning({ id: organizacoes.id });
    return comoIdentificador<"Organizacao">(linha!.id);
  }

  async criarEmpresa(dados: { organizacaoId: IdOrganizacao; nome: string; nomeFantasia?: string; cnpj?: string }): Promise<IdEmpresa> {
    const [linha] = await this.transacao
      .insert(empresas)
      .values({
        organizacaoId: dados.organizacaoId,
        nome: dados.nome,
        nomeFantasia: dados.nomeFantasia ?? null,
        cnpj: dados.cnpj ?? null,
      })
      .returning({ id: empresas.id });
    return comoIdentificador<"Empresa">(linha!.id);
  }

  async criarVinculo(dados: { usuarioId: IdUsuario; organizacaoId: IdOrganizacao; empresaId: IdEmpresa; papel: Papel }): Promise<void> {
    await this.transacao.insert(vinculosUsuario).values({
      usuarioId: dados.usuarioId,
      organizacaoId: dados.organizacaoId,
      empresaId: dados.empresaId,
      papel: dados.papel,
    });
  }

  registrarAuditoria(evento: Parameters<RegistradorAuditoriaDrizzle["registrar"]>[0]): Promise<void> {
    return this.auditoria.registrar(evento);
  }
}
